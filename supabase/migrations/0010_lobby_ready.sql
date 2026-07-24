-- Lobby ready-check + anchored start times.
--
--   * Rooms are matched per week/day and keep the starts_at they were created
--     with (no more rolling 12s countdown that resets when someone joins).
--   * Monday rooms anchor to the slot gather deadline; sandbox weeks use a
--     short fixed lobby (sandbox_lobby_seconds) so playtests stay fast.
--   * tap_room_ready: when every member is ready, the start is pulled forward
--     to now() + ready_fast_start_seconds.

alter table public.room_members
  add column if not exists ready_at timestamptz;

insert into public.game_config (key, value) values
  ('sandbox_lobby_seconds', '60'),
  ('ready_fast_start_seconds', '10')
on conflict (key) do nothing;

-- Stream rooms updates (starts_at / phase) to lobby clients.
do $$
begin
  alter publication supabase_realtime add table public.rooms;
exception
  when duplicate_object then null;
end $$;

-- Week/day-scoped matchmaking with an explicit start anchor. Never touches
-- starts_at of existing rooms and skips rooms whose start already passed.
create or replace function public.join_or_create_room_v2(
  p_character text,
  p_week_id text,
  p_weekday text,
  p_starts_at timestamptz
)
returns table (
  room_id         uuid,
  seed            bigint,
  starts_at       timestamptz,
  phase           text,
  global_sub_lane int,
  server_now      timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_low  int;
  v_high int;
  v_room public.rooms%rowtype;
  v_slot int;
  v_seed bigint;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_character not in ('bug', 'human', 'klaus') then
    raise exception 'invalid character: %', p_character;
  end if;

  v_low  := case p_character when 'bug' then 0 when 'human' then 3 else 6 end;
  v_high := v_low + 2;

  -- Already waiting in a live room for this week/day? Return the assignment.
  select r.* into v_room
  from public.rooms r
  join public.room_members m on m.room_id = r.id
  where m.user_id = v_user
    and r.phase in ('waiting', 'countdown')
    and r.week_id = p_week_id
    and r.weekday = p_weekday
    and r.starts_at > now()
  order by r.created_at desc
  limit 1;

  if found then
    select m.global_sub_lane into v_slot
    from public.room_members m
    where m.room_id = v_room.id and m.user_id = v_user;
    return query
      select v_room.id, v_room.seed, v_room.starts_at, v_room.phase, v_slot, now();
    return;
  end if;

  -- Find an open, non-full, not-yet-started room for this week/day.
  for v_room in
    select r.*
    from public.rooms r
    where r.phase in ('waiting', 'countdown')
      and r.week_id = p_week_id
      and r.weekday = p_weekday
      and r.starts_at > now()
      and (select count(*) from public.room_members m where m.room_id = r.id) < r.max_players
    order by r.created_at asc
    for update skip locked
  loop
    select g into v_slot
    from generate_series(v_low, v_high) g
    where not exists (
      select 1 from public.room_members m
      where m.room_id = v_room.id and m.global_sub_lane = g
    )
    order by g
    limit 1;

    if v_slot is not null then
      insert into public.room_members (room_id, user_id, character_type, global_sub_lane)
      values (v_room.id, v_user, p_character, v_slot);
      return query
        select v_room.id, v_room.seed, v_room.starts_at, v_room.phase, v_slot, now();
      return;
    end if;
  end loop;

  -- No room available: create one anchored to the provided start time.
  v_seed := floor(random() * 2147483647)::bigint;
  insert into public.rooms (seed, phase, starts_at, week_id, weekday)
  values (v_seed, 'countdown', p_starts_at, p_week_id, p_weekday)
  returning * into v_room;

  insert into public.room_members (room_id, user_id, character_type, global_sub_lane)
  values (v_room.id, v_user, p_character, v_low);

  return query
    select v_room.id, v_room.seed, v_room.starts_at, v_room.phase, v_low, now();
end;
$$;

grant execute on function public.join_or_create_room_v2(text, text, text, timestamptz) to authenticated;

-- Ready vote: everyone ready pulls the start forward to a short countdown.
create or replace function public.tap_room_ready(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_all_ready boolean;
  v_fast int := public.get_game_config_int('ready_fast_start_seconds', 10);
  v_new timestamptz;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select * into v_room from public.rooms where id = p_room_id;
  if v_room.id is null then
    raise exception 'room not found';
  end if;
  if v_room.phase not in ('waiting', 'countdown') then
    return jsonb_build_object('ok', false, 'reason', 'already_started');
  end if;
  if not exists (
    select 1 from public.room_members m
    where m.room_id = p_room_id and m.user_id = v_user
  ) then
    raise exception 'not a room member';
  end if;

  update public.room_members
  set ready_at = coalesce(ready_at, now())
  where room_id = p_room_id and user_id = v_user;

  select bool_and(m.ready_at is not null) into v_all_ready
  from public.room_members m
  where m.room_id = p_room_id;

  if coalesce(v_all_ready, false) then
    v_new := least(v_room.starts_at, now() + make_interval(secs => v_fast));
    update public.rooms
    set starts_at = v_new,
        phase = 'countdown'
    where id = p_room_id and phase in ('waiting', 'countdown');
  end if;

  select * into v_room from public.rooms where id = p_room_id;
  return jsonb_build_object(
    'ok', true,
    'all_ready', coalesce(v_all_ready, false),
    'starts_at', v_room.starts_at
  );
end;
$$;

grant execute on function public.tap_room_ready(uuid) to authenticated;

-- tournament_join_room: same gate checks as 0008, but rooms are anchored —
-- Monday to the slot gather deadline (sandbox: short fixed lobby), other days
-- to now() + p_lobby_seconds — and matched per week/day via v2.
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
  v_reg public.race_registrations%rowtype;
  v_bounds record;
  v_anchor timestamptz;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select t.week_id, t.weekday into v_week_id, v_weekday
  from public.current_tournament_day(p_override) t;

  perform public.ensure_tournament_week(v_week_id);

  if v_weekday = 'monday' then
    select * into v_reg
    from public.race_registrations rr
    where rr.user_id = v_user and rr.week_id = v_week_id;

    if v_reg.id is null then
      raise exception 'not_registered';
    end if;

    if v_reg.raced_at is not null then
      raise exception 'already_raced';
    end if;

    select b.opens_at, b.closes_at into v_bounds
    from public.monday_slot_bounds(v_week_id, v_reg.slot_id) b;

    if now() < v_bounds.opens_at then
      raise exception 'slot_not_open';
    end if;

    if now() > v_bounds.closes_at then
      raise exception 'slot_closed';
    end if;

    v_character := 'human';

    if public.is_sandbox_week_id(v_week_id)
       and public.get_game_config_bool('dev_mode', false) then
      v_anchor := now() + make_interval(
        secs => public.get_game_config_int('sandbox_lobby_seconds', 60)
      );
    else
      v_anchor := v_bounds.closes_at;
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

    v_anchor := now() + make_interval(secs => greatest(p_lobby_seconds, 1));
  end if;

  if v_weekday = 'saturday' then
    v_max_sat := public.get_game_config_int('max_saturday_rooms', 6);
    select count(*) into v_sat_count
    from public.rooms r
    where r.week_id = v_week_id and r.weekday = 'saturday';

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
  from public.join_or_create_room_v2(v_character, v_week_id, v_weekday, v_anchor) j
  limit 1;

  return query
    select v_join.room_id,
           v_join.seed,
           v_join.starts_at,
           v_join.phase,
           v_join.global_sub_lane,
           now();
end;
$$;
