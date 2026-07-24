-- Monday registration flow: one race per week, slot windows, stale room reset.

alter table public.race_registrations
  add column if not exists raced_at timestamptz;

create or replace function public.monday_slot_bounds(p_week_id text, p_slot_id text)
returns table (opens_at timestamptz, closes_at timestamptz)
language plpgsql
stable
as $$
declare
  v_hour int;
  v_minute int := 0;
  v_gather_min int;
begin
  v_hour := nullif(regexp_replace(p_slot_id, '\D', '', 'g'), '')::int;
  if v_hour is null then
    v_hour := 12;
  end if;

  v_gather_min := public.get_game_config_int('monday_gather_minutes', 5);

  return query select
    (p_week_id::date + make_interval(hours => v_hour, mins => v_minute)) at time zone 'UTC',
    (p_week_id::date + make_interval(hours => v_hour, mins => v_minute) + make_interval(mins => v_gather_min)) at time zone 'UTC';
end;
$$;

create or replace function public.refresh_room_countdown(
  p_room_id uuid,
  p_lobby_seconds int default 12
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_starts timestamptz;
begin
  update public.rooms
  set starts_at = now() + make_interval(secs => p_lobby_seconds),
      phase = 'countdown'
  where id = p_room_id
    and phase in ('waiting', 'countdown')
    and (starts_at is null or starts_at <= now())
  returning starts_at into v_starts;

  if v_starts is null then
    select starts_at into v_starts from public.rooms where id = p_room_id;
  end if;

  return v_starts;
end;
$$;

insert into public.game_config (key, value) values ('monday_gather_minutes', '5')
on conflict (key) do nothing;

create or replace function public.register_monday_slot(
  p_slot_id text,
  p_character text default null,
  p_override text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_week_id text;
  v_weekday text;
  v_row public.race_registrations%rowtype;
  v_bounds record;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select t.week_id, t.weekday into v_week_id, v_weekday
  from public.current_tournament_day(p_override) t;

  if v_weekday <> 'monday' then
    raise exception 'wrong_day';
  end if;

  select * into v_row
  from public.race_registrations
  where user_id = v_user and week_id = v_week_id;

  if v_row.raced_at is not null then
    raise exception 'already_raced';
  end if;

  perform public.ensure_tournament_week(v_week_id);

  insert into public.race_registrations (user_id, week_id, slot_id, character_type)
  values (v_user, v_week_id, p_slot_id, 'pending')
  on conflict (user_id, week_id) do update
    set slot_id = excluded.slot_id,
        character_type = 'pending'
  returning * into v_row;

  select b.opens_at, b.closes_at into v_bounds
  from public.monday_slot_bounds(v_week_id, p_slot_id) b;

  return jsonb_build_object(
    'id', v_row.id,
    'slot_id', v_row.slot_id,
    'week_id', v_row.week_id,
    'opens_at', v_bounds.opens_at,
    'closes_at', v_bounds.closes_at
  );
end;
$$;

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

  if v_room.weekday = 'monday' then
    update public.race_registrations rr
    set character_type = m.character_type
    from public.room_members m
    where rr.user_id = m.user_id
      and m.room_id = p_room_id
      and rr.week_id = v_room.week_id
      and m.user_id = auth.uid();
  end if;

  return jsonb_build_object('assigned', v_n);
end;
$$;

-- Patch tournament_join_room Monday checks + stale countdown reset (full body from 0007 version)
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
  from public.join_or_create_room(v_character, p_lobby_seconds) j
  limit 1;

  perform public.refresh_room_countdown(v_join.room_id, p_lobby_seconds);

  select r.starts_at, r.phase into v_join.starts_at, v_join.phase
  from public.rooms r where r.id = v_join.room_id;

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
           now();
end;
$$;

create or replace function public.record_results(
  p_room_id uuid,
  p_override text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_week_id text;
  v_weekday text;
  v_ready_count int;
  v_low_threshold int;
  v_top_k int;
  v_next_entry text;
  v_member record;
  v_awarded uuid[] := array[]::uuid[];
  v_slot int;
  v_pass_id uuid;
  v_my_outcome text := 'eliminated';
  v_my_pass_id uuid;
  v_sunday_slot int;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select * into v_room from public.rooms where id = p_room_id for update;
  if v_room.id is null then
    raise exception 'room not found';
  end if;

  if v_room.results_recorded_at is not null then
    select p.id into v_my_pass_id
    from public.passes p
    where p.user_id = v_user
      and p.week_id = v_room.week_id
      and p.won_on = v_room.weekday
      and p.created_at >= v_room.created_at
    order by p.created_at desc
    limit 1;

    return jsonb_build_object(
      'already_recorded', true,
      'outcome', case when v_my_pass_id is not null then 'advanced' else 'eliminated' end,
      'pass_id', v_my_pass_id
    );
  end if;

  v_week_id := v_room.week_id;
  v_weekday := v_room.weekday;

  if v_weekday = 'monday' then
    update public.race_registrations
    set raced_at = now()
    where week_id = v_week_id
      and user_id in (select user_id from public.room_members where room_id = p_room_id);
  end if;

  if v_weekday = 'monday' then
    select count(*) into v_ready_count
    from public.race_registrations
    where week_id = v_week_id;
  else
    select count(*) into v_ready_count
    from public.ready_votes
    where week_id = v_week_id and weekday = v_weekday;
  end if;

  v_low_threshold := public.get_game_config_int('advancement_low_threshold', 8);

  if v_weekday in ('monday', 'tuesday') and v_ready_count < v_low_threshold then
    v_top_k := 999;
  elsif v_weekday in ('monday', 'tuesday') then
    v_top_k := 3;
  elsif v_weekday in ('wednesday', 'thursday') then
    v_top_k := 2;
  elsif v_weekday = 'friday' then
    v_top_k := 1;
  elsif v_weekday = 'saturday' then
    v_top_k := 1;
  else
    v_top_k := 0;
  end if;

  v_next_entry := public.next_grants_entry(v_weekday);

  for v_member in
    select m.user_id, m.finish_time_ms, m.finished, m.died,
           row_number() over (
             order by case when m.finished and not m.died then 0 else 1 end,
                      coalesce(m.finish_time_ms, 2147483647)
           ) as placement
    from public.room_members m
    where m.room_id = p_room_id
  loop
    if v_weekday = 'sunday' then
      if v_member.placement = 1 and v_member.finished and not v_member.died then
        perform public.ensure_tournament_week(v_week_id);
        update public.tournament_weeks
        set champion_user_id = v_member.user_id,
            status = 'finished'
        where week_id = v_week_id;

        insert into public.billboard_entitlements (week_id, owner_user_id)
        values (v_week_id, v_member.user_id)
        on conflict (week_id) do update
          set owner_user_id = excluded.owner_user_id;

        if v_member.user_id = v_user then
          v_my_outcome := 'champion';
        end if;
      end if;
      continue;
    end if;

    if not v_member.finished or v_member.died then
      continue;
    end if;

    if v_member.placement > v_top_k then
      continue;
    end if;

    if v_next_entry is null then
      continue;
    end if;

    insert into public.passes (user_id, week_id, grants_entry, won_on, nft_address)
    values (
      v_member.user_id,
      v_week_id,
      v_next_entry,
      v_weekday,
      'mock:' || gen_random_uuid()::text
    )
    returning id into v_pass_id;

    v_awarded := array_append(v_awarded, v_pass_id);

    if v_weekday = 'saturday' and v_next_entry = 'sunday' then
      select coalesce(max(sp.slot), 0) + 1 into v_slot
      from public.sunday_passes sp
      where sp.week_id = v_week_id;

      if v_slot <= public.get_game_config_int('max_saturday_rooms', 6) then
        insert into public.sunday_passes (week_id, slot, pass_id, saturday_room_id)
        values (v_week_id, v_slot, v_pass_id, p_room_id)
        on conflict do nothing;

        if v_member.user_id = v_user then
          v_sunday_slot := v_slot;
        end if;
      end if;
    end if;

    if v_member.user_id = v_user then
      v_my_outcome := case
        when v_weekday = 'saturday' then 'sunday_pass'
        else 'advanced'
      end;
      v_my_pass_id := v_pass_id;
    end if;
  end loop;

  update public.rooms
  set results_recorded_at = now()
  where id = p_room_id;

  return jsonb_build_object(
    'outcome', v_my_outcome,
    'pass_id', v_my_pass_id,
    'grants_entry', v_next_entry,
    'sunday_slot', v_sunday_slot,
    'awarded_count', coalesce(array_length(v_awarded, 1), 0)
  );
end;
$$;

create or replace function public.get_my_week_state(p_override text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_week_id text;
  v_weekday text;
  v_wallet text;
  v_passes jsonb;
  v_registration jsonb;
  v_ready_count int;
  v_champion uuid;
  v_billboard boolean := false;
  v_is_champion boolean := false;
  v_opens timestamptz;
  v_closes timestamptz;
begin
  if v_user is null then
    return jsonb_build_object('authenticated', false);
  end if;

  select t.week_id, t.weekday into v_week_id, v_weekday
  from public.current_tournament_day(p_override) t;

  select wallet_address into v_wallet from public.profiles where id = v_user;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'grants_entry', p.grants_entry,
    'won_on', p.won_on,
    'week_id', p.week_id,
    'status', p.status
  ) order by p.created_at), '[]'::jsonb)
  into v_passes
  from public.passes p
  where p.user_id = v_user
    and p.week_id = v_week_id
    and p.status = 'active';

  select jsonb_build_object(
    'slot_id', rr.slot_id,
    'character_type', rr.character_type,
    'raced_at', rr.raced_at
  )
  into v_registration
  from public.race_registrations rr
  where rr.user_id = v_user and rr.week_id = v_week_id;

  if v_registration is not null then
    select b.opens_at, b.closes_at into v_opens, v_closes
    from public.monday_slot_bounds(v_week_id, (v_registration->>'slot_id')) b;

    v_registration := v_registration || jsonb_build_object(
      'opens_at', v_opens,
      'closes_at', v_closes
    );
  end if;

  if v_weekday = 'monday' then
    select count(*) into v_ready_count
    from public.race_registrations where week_id = v_week_id;
  else
    select count(*) into v_ready_count
    from public.ready_votes where week_id = v_week_id and weekday = v_weekday;
  end if;

  select champion_user_id into v_champion
  from public.tournament_weeks where week_id = v_week_id;

  v_is_champion := v_champion = v_user;

  select exists (
    select 1 from public.billboard_entitlements be
    where be.week_id = (
      select tw.week_id from public.tournament_weeks tw
      where tw.champion_user_id is not null
      order by tw.created_at desc
      limit 1
    )
  ) into v_billboard;

  return jsonb_build_object(
    'authenticated', true,
    'week_id', v_week_id,
    'weekday', v_weekday,
    'wallet_address', v_wallet,
    'wallet_linked', v_wallet is not null,
    'passes', v_passes,
    'registration', v_registration,
    'ready_count', v_ready_count,
    'is_champion', v_is_champion,
    'champion_billboard_active', v_billboard
  );
end;
$$;

grant execute on function public.monday_slot_bounds(text, text) to authenticated;
grant execute on function public.refresh_room_countdown(uuid, int) to authenticated;
