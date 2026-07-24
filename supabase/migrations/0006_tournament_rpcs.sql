-- Tournament RPCs: week clock, wallet, registration, matchmaking, burn, roles, results.

create or replace function public.get_game_config_value(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select value from public.game_config where key = p_key;
$$;

create or replace function public.get_game_config_int(p_key text, p_default int)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((value #>> '{}')::int, p_default)
  from public.game_config
  where key = p_key
  union all
  select p_default
  limit 1;
$$;

create or replace function public.get_game_config_bool(p_key text, p_default boolean default false)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((value #>> '{}')::boolean, p_default)
  from public.game_config
  where key = p_key
  union all
  select p_default
  limit 1;
$$;

create or replace function public.compute_week_id(p_now timestamptz default now())
returns text
language plpgsql
immutable
as $$
declare
  v_utc date;
  v_dow int;
  v_monday date;
begin
  v_utc := (p_now at time zone 'UTC')::date;
  v_dow := extract(dow from v_utc)::int;
  v_monday := v_utc - ((v_dow + 6) % 7);
  return to_char(v_monday, 'YYYY-MM-DD');
end;
$$;

create or replace function public.current_tournament_day(p_override text default null)
returns table (week_id text, weekday text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_week_id text;
  v_weekday text;
  v_dow int;
  v_valid_days text[] := array[
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
  ];
begin
  v_week_id := public.compute_week_id(now());
  v_dow := extract(dow from (now() at time zone 'UTC'))::int;
  v_weekday := case v_dow
    when 0 then 'sunday'
    when 1 then 'monday'
    when 2 then 'tuesday'
    when 3 then 'wednesday'
    when 4 then 'thursday'
    when 5 then 'friday'
    else 'saturday'
  end;

  if p_override is not null
     and public.get_game_config_bool('dev_mode', false)
     and lower(p_override) = any (v_valid_days) then
    v_weekday := lower(p_override);
  end if;

  return query select v_week_id, v_weekday;
end;
$$;

create or replace function public.next_grants_entry(p_weekday text)
returns text
language sql
immutable
as $$
  select case p_weekday
    when 'monday' then 'tuesday'
    when 'tuesday' then 'wednesday'
    when 'wednesday' then 'thursday'
    when 'thursday' then 'friday'
    when 'friday' then 'saturday'
    when 'saturday' then 'sunday'
    else null
  end;
$$;

create or replace function public.ensure_tournament_week(p_week_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tournament_weeks (week_id)
  values (p_week_id)
  on conflict (week_id) do nothing;
end;
$$;

create or replace function public.link_wallet(p_address text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_existing text;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_address is null or length(trim(p_address)) = 0 then
    raise exception 'invalid address';
  end if;

  select wallet_address into v_existing from public.profiles where id = v_user;
  if v_existing is not null and v_existing <> p_address then
    raise exception 'wallet already linked';
  end if;

  update public.profiles
  set wallet_address = p_address,
      wallet_linked_at = coalesce(wallet_linked_at, now())
  where id = v_user;

  return jsonb_build_object('address', p_address);
end;
$$;

create or replace function public.register_monday_slot(
  p_slot_id text,
  p_character text,
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
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_character not in ('bug', 'human', 'klaus') then
    raise exception 'invalid character: %', p_character;
  end if;

  select t.week_id, t.weekday into v_week_id, v_weekday
  from public.current_tournament_day(p_override) t;

  if v_weekday <> 'monday' then
    raise exception 'wrong_day';
  end if;

  perform public.ensure_tournament_week(v_week_id);

  insert into public.race_registrations (user_id, week_id, slot_id, character_type)
  values (v_user, v_week_id, p_slot_id, p_character)
  on conflict (user_id, week_id) do update
    set slot_id = excluded.slot_id,
        character_type = excluded.character_type
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'slot_id', v_row.slot_id,
    'character_type', v_row.character_type,
    'week_id', v_row.week_id
  );
end;
$$;

create or replace function public.tap_ready(p_override text default null)
returns jsonb
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
  v_ready_count int;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select t.week_id, t.weekday into v_week_id, v_weekday
  from public.current_tournament_day(p_override) t;

  if v_weekday = 'monday' then
    raise exception 'wrong_day';
  end if;

  select wallet_address into v_wallet from public.profiles where id = v_user;
  if v_wallet is null then
    raise exception 'no_wallet';
  end if;

  select id into v_pass_id
  from public.passes
  where user_id = v_user
    and week_id = v_week_id
    and grants_entry = v_weekday
    and status = 'active'
  limit 1;

  if v_pass_id is null then
    raise exception 'no_pass';
  end if;

  insert into public.ready_votes (user_id, week_id, weekday)
  values (v_user, v_week_id, v_weekday)
  on conflict (user_id, week_id, weekday) do nothing;

  select count(*) into v_ready_count
  from public.ready_votes
  where week_id = v_week_id and weekday = v_weekday;

  return jsonb_build_object(
    'ready_count', v_ready_count,
    'week_id', v_week_id,
    'weekday', v_weekday,
    'pass_id', v_pass_id
  );
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
      ) and v_weekday <> 'sunday' then
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
    where r.week_id = v_week_id
      and r.weekday = 'saturday'
      and r.phase <> 'finished';

    if v_sat_count >= v_max_sat then
      if not exists (
        select 1
        from public.rooms r
        join public.room_members m on m.room_id = r.id
        where m.user_id = v_user
          and r.week_id = v_week_id
          and r.weekday = 'saturday'
          and r.phase in ('waiting', 'countdown')
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

create or replace function public.confirm_pass_burn(
  p_room_id uuid,
  p_tx_hash text,
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
  v_pass public.passes%rowtype;
  v_existing uuid;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select t.week_id, t.weekday into v_week_id, v_weekday
  from public.current_tournament_day(p_override) t;

  if v_weekday = 'monday' then
    return jsonb_build_object('skipped', true, 'weekday', v_weekday);
  end if;

  select pass_id into v_existing
  from public.pass_burns
  where room_id = p_room_id and user_id = v_user;

  if v_existing is not null then
    return jsonb_build_object('pass_id', v_existing, 'already_burned', true);
  end if;

  select * into v_pass
  from public.passes
  where user_id = v_user
    and week_id = v_week_id
    and grants_entry = v_weekday
    and status = 'active'
  for update;

  if v_pass.id is null then
    raise exception 'no_pass';
  end if;

  update public.passes set status = 'burned' where id = v_pass.id;

  insert into public.pass_burns (pass_id, user_id, week_id, weekday, room_id, tx_hash)
  values (v_pass.id, v_user, v_week_id, v_weekday, p_room_id, p_tx_hash);

  update public.room_members
  set pass_id = v_pass.id
  where room_id = p_room_id and user_id = v_user;

  return jsonb_build_object('pass_id', v_pass.id, 'weekday', v_weekday);
end;
$$;

create or replace function public.refund_pass_burn(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_burn public.pass_burns%rowtype;
  v_phase text;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select phase into v_phase from public.rooms where id = p_room_id;
  if v_phase not in ('waiting', 'countdown') then
    return;
  end if;

  select * into v_burn
  from public.pass_burns
  where room_id = p_room_id and user_id = v_user;

  if v_burn.id is null then
    return;
  end if;

  update public.passes set status = 'active' where id = v_burn.pass_id;
  delete from public.pass_burns where id = v_burn.id;

  update public.room_members
  set pass_id = null, assigned_species = null
  where room_id = p_room_id and user_id = v_user;
end;
$$;

create or replace function public.species_counts_for_n(p_n int)
returns table (bug int, human int, klaus int)
language plpgsql
immutable
as $$
begin
  return query select
    case p_n
      when 6 then 3 when 5 then 2 when 4 then 2 when 3 then 1 when 2 then 1 else 1
    end,
    case p_n
      when 6 then 2 when 5 then 2 when 4 then 1 when 3 then 1 when 2 then 1 else 0
    end,
    case p_n
      when 6 then 1 when 5 then 1 when 4 then 1 when 3 then 1 when 2 then 0 else 0
    end;
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

  for v_member in
    select user_id from public.room_members where room_id = p_room_id order by joined_at
  loop
    v_lane := case v_species[v_idx]
      when 'bug' then 0 + (
        select count(*) from public.room_members m2
        where m2.room_id = p_room_id and m2.assigned_species = 'bug'
      )
      when 'human' then 3 + (
        select count(*) from public.room_members m2
        where m2.room_id = p_room_id and m2.assigned_species = 'human'
      )
      else 6 + (
        select count(*) from public.room_members m2
        where m2.room_id = p_room_id and m2.assigned_species = 'klaus'
      )
    end;

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
  v_rank int := 0;
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
    'character_type', rr.character_type
  )
  into v_registration
  from public.race_registrations rr
  where rr.user_id = v_user and rr.week_id = v_week_id;

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

create or replace function public.get_sunday_finalists(p_override text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_week_id text;
begin
  select t.week_id into v_week_id
  from public.current_tournament_day(p_override) t;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'slot', sp.slot,
      'user_id', p.user_id,
      'username', pr.username
    ) order by sp.slot)
    from public.sunday_passes sp
    join public.passes p on p.id = sp.pass_id
    join public.profiles pr on pr.id = p.user_id
    where sp.week_id = v_week_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.transfer_billboard_rights(
  p_to_user uuid,
  p_week_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_week text;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  v_week := coalesce(
    p_week_id,
    (select week_id from public.tournament_weeks where champion_user_id = v_user order by created_at desc limit 1)
  );

  update public.billboard_entitlements
  set transferred_to = p_to_user
  where week_id = v_week and owner_user_id = v_user;

  return jsonb_build_object('week_id', v_week, 'transferred_to', p_to_user);
end;
$$;

create or replace function public.update_billboard_creative(
  p_creative_url text,
  p_week_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_week text;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  v_week := coalesce(
    p_week_id,
    (select week_id from public.tournament_weeks where champion_user_id = v_user order by created_at desc limit 1)
  );

  update public.billboard_entitlements
  set creative_url = p_creative_url
  where week_id = v_week and (owner_user_id = v_user or transferred_to = v_user);

  return jsonb_build_object('week_id', v_week, 'creative_url', p_creative_url);
end;
$$;

grant execute on function public.current_tournament_day(text) to authenticated;
grant execute on function public.link_wallet(text) to authenticated;
grant execute on function public.register_monday_slot(text, text, text) to authenticated;
grant execute on function public.tap_ready(text) to authenticated;
grant execute on function public.tournament_join_room(text, int, text) to authenticated;
grant execute on function public.confirm_pass_burn(uuid, text, text) to authenticated;
grant execute on function public.refund_pass_burn(uuid) to authenticated;
grant execute on function public.assign_roles(uuid) to authenticated;
grant execute on function public.record_results(uuid, text) to authenticated;
grant execute on function public.get_my_week_state(text) to authenticated;
grant execute on function public.get_sunday_finalists(text) to authenticated;
grant execute on function public.transfer_billboard_rights(uuid, text) to authenticated;
grant execute on function public.update_billboard_creative(text, text) to authenticated;
