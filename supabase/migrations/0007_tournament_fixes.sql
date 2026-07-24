-- Fixes from post-implementation review:
-- 1. assign_roles: park lanes at temp values before final assignment so the
--    room_members_unique_lane constraint can't fire mid-reassignment.
-- 2. tournament_join_room: Saturday cap (I5) counts ALL Saturday rooms for the
--    week, not just unfinished ones — finished rooms still consume the cap.

create or replace function public.assign_roles(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_n int;
  v_bug int;
  v_human int;
  v_klaus int;
  v_species text[];
  v_member record;
  v_idx int := 1;
  v_lane int;
  v_bug_used int := 0;
  v_human_used int := 0;
  v_klaus_used int := 0;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if v_room.id is null then
    raise exception 'room not found';
  end if;

  if v_room.weekday = 'monday' then
    return jsonb_build_object('skipped', true);
  end if;

  if exists (
    select 1 from public.room_members m
    where m.room_id = p_room_id and m.assigned_species is not null
  ) then
    return jsonb_build_object('already_assigned', true);
  end if;

  select count(*) into v_n from public.room_members where room_id = p_room_id;
  select s.bug, s.human, s.klaus into v_bug, v_human, v_klaus
  from public.species_counts_for_n(v_n) s;

  v_species := array[]::text[];
  for i in 1..v_bug loop
    v_species := array_append(v_species, 'bug');
  end loop;
  for i in 1..v_human loop
    v_species := array_append(v_species, 'human');
  end loop;
  for i in 1..v_klaus loop
    v_species := array_append(v_species, 'klaus');
  end loop;

  perform setseed(
    abs(hashtext(coalesce(v_room.week_id, '') || v_room.id::text))::float / 2147483647
  );

  v_species := (
    select array_agg(x order by random())
    from unnest(v_species) x
  );

  -- Park all lanes out of the 0-8 range first so final assignments can't
  -- collide with a not-yet-reassigned member's old lane.
  update public.room_members m
  set global_sub_lane = 100 + sub.rn
  from (
    select user_id, row_number() over (order by joined_at) as rn
    from public.room_members
    where room_id = p_room_id
  ) sub
  where m.room_id = p_room_id and m.user_id = sub.user_id;

  for v_member in
    select user_id from public.room_members where room_id = p_room_id order by joined_at
  loop
    if v_species[v_idx] = 'bug' then
      v_lane := 0 + v_bug_used;
      v_bug_used := v_bug_used + 1;
    elsif v_species[v_idx] = 'human' then
      v_lane := 3 + v_human_used;
      v_human_used := v_human_used + 1;
    else
      v_lane := 6 + v_klaus_used;
      v_klaus_used := v_klaus_used + 1;
    end if;

    update public.room_members
    set assigned_species = v_species[v_idx],
        character_type = v_species[v_idx],
        global_sub_lane = v_lane
    where room_id = p_room_id and user_id = v_member.user_id;

    v_idx := v_idx + 1;
  end loop;

  return jsonb_build_object('assigned', v_n);
end;
$$;

create or replace function public.tournament_join_room(
  p_character text,
  p_lobby_seconds int default 12,
  p_override text default null
)
returns table (
  room_id uuid,
  seed bigint,
  starts_at timestamptz,
  phase text,
  global_sub_lane int,
  server_now timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_week_id text;
  v_weekday text;
  v_wallet text;
  v_pass_id uuid;
  v_character text := p_character;
  v_join record;
  v_sat_count int;
  v_max_sat int;
  v_sunday_room uuid;
  v_in_open_sat_room boolean;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select t.week_id, t.weekday into v_week_id, v_weekday
  from public.current_tournament_day(p_override) t;

  perform public.ensure_tournament_week(v_week_id);

  if v_weekday = 'monday' then
    select rr.character_type into v_character
    from public.race_registrations rr
    where rr.user_id = v_user and rr.week_id = v_week_id;

    if v_character is null then
      raise exception 'not_registered';
    end if;
  else
    select wallet_address into v_wallet from public.profiles where id = v_user;
    if v_wallet is null then
      raise exception 'no_wallet';
    end if;

    if v_weekday = 'sunday' then
      select p.id into v_pass_id
      from public.passes p
      where p.user_id = v_user
        and p.week_id = v_week_id
        and p.grants_entry = 'sunday'
        and p.status = 'active'
      limit 1;

      if v_pass_id is null then
        raise exception 'no_sunday_pass';
      end if;
    else
      select p.id into v_pass_id
      from public.passes p
      where p.user_id = v_user
        and p.week_id = v_week_id
        and p.grants_entry = v_weekday
        and p.status = 'active'
      limit 1;

      if v_pass_id is null then
        raise exception 'no_pass';
      end if;

      if not exists (
        select 1 from public.ready_votes rv
        where rv.user_id = v_user and rv.week_id = v_week_id and rv.weekday = v_weekday
      ) then
        raise exception 'not_ready';
      end if;
    end if;

    if v_character not in ('bug', 'human', 'klaus') then
      v_character := 'human';
    end if;
  end if;

  if v_weekday = 'saturday' then
    v_max_sat := public.get_game_config_int('max_saturday_rooms', 6);

    -- I5: cap counts every Saturday room this week — finished ones included.
    select count(*) into v_sat_count
    from public.rooms r
    where r.week_id = v_week_id
      and r.weekday = 'saturday';

    select exists (
      select 1
      from public.rooms r
      join public.room_members m on m.room_id = r.id
      where m.user_id = v_user
        and r.week_id = v_week_id
        and r.weekday = 'saturday'
        and r.phase in ('waiting', 'countdown')
    ) into v_in_open_sat_room;

    if v_sat_count >= v_max_sat and not v_in_open_sat_room then
      -- Joining an existing open Saturday room is still allowed; creating
      -- room N+1 is not. join_or_create_room may create, so block here
      -- unless an open, non-full Saturday room exists.
      if not exists (
        select 1
        from public.rooms r
        where r.week_id = v_week_id
          and r.weekday = 'saturday'
          and r.phase in ('waiting', 'countdown')
          and (select count(*) from public.room_members m where m.room_id = r.id) < r.max_players
      ) then
        raise exception 'saturday_full';
      end if;
    end if;
  end if;

  if v_weekday = 'sunday' then
    select r.id into v_sunday_room
    from public.rooms r
    where r.week_id = v_week_id and r.weekday = 'sunday'
    order by r.created_at asc
    limit 1;

    if v_sunday_room is not null then
      if not exists (
        select 1 from public.room_members m
        where m.room_id = v_sunday_room and m.user_id = v_user
      ) and (
        select count(*) from public.room_members m where m.room_id = v_sunday_room
      ) >= (select max_players from public.rooms where id = v_sunday_room) then
        raise exception 'sunday_full';
      end if;
    end if;
  end if;

  select *
  into v_join
  from public.join_or_create_room(v_character, p_lobby_seconds) j
  limit 1;

  update public.rooms
  set week_id = v_week_id,
      weekday = v_weekday
  where id = v_join.room_id
    and (week_id is null or week_id = v_week_id);

  return query
    select v_join.room_id,
           v_join.seed,
           v_join.starts_at,
           v_join.phase,
           v_join.global_sub_lane,
           v_join.server_now;
end;
$$;
