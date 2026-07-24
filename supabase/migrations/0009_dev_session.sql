-- Dev / sandbox session support:
--   p_override may be "tuesday" or "tuesday|sandbox:3"
--   Sandbox weeks map to reserved Monday dates (2090-01-04 + (n-1)*7)
--   so race_registrations / passes stay isolated per test week.
--   Monday slot windows are always open for sandbox weeks when dev_mode.

insert into public.game_config (key, value) values
  ('dev_mode', 'true'),
  ('dev_sandbox_anchor', '"2090-01-04"')
on conflict (key) do nothing;

create or replace function public.is_sandbox_week_id(p_week_id text)
returns boolean
language plpgsql
immutable
as $$
begin
  if p_week_id is null or p_week_id !~ '^\d{4}-\d{2}-\d{2}$' then
    return false;
  end if;
  return p_week_id::date >= date '2090-01-04'
     and p_week_id::date < date '2100-01-01';
exception
  when others then
    return false;
end;
$$;

create or replace function public.sandbox_week_id_from_index(p_index int)
returns text
language sql
immutable
as $$
  select to_char(
    date '2090-01-04' + ((greatest(coalesce(p_index, 1), 1) - 1) * 7),
    'YYYY-MM-DD'
  );
$$;

create or replace function public.sandbox_index_from_week_id(p_week_id text)
returns int
language plpgsql
immutable
as $$
declare
  v_days int;
begin
  if not public.is_sandbox_week_id(p_week_id) then
    return null;
  end if;
  v_days := (p_week_id::date - date '2090-01-04');
  if v_days < 0 or (v_days % 7) <> 0 then
    return null;
  end if;
  return (v_days / 7) + 1;
end;
$$;

-- Parse "monday" | "monday|sandbox:2" into weekday + optional week_id.
create or replace function public.parse_tournament_override(p_override text)
returns table (weekday text, week_id text, sandbox_index int)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_raw text := lower(trim(coalesce(p_override, '')));
  v_day_part text;
  v_week_part text;
  v_valid_days text[] := array[
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
  ];
  v_idx int;
  v_pipe int;
begin
  weekday := null;
  week_id := null;
  sandbox_index := null;

  if v_raw = '' then
    return next;
    return;
  end if;

  if not public.get_game_config_bool('dev_mode', false) then
    return next;
    return;
  end if;

  v_pipe := position('|' in v_raw);
  if v_pipe > 0 then
    v_day_part := trim(both from substring(v_raw from 1 for v_pipe - 1));
    v_week_part := trim(both from substring(v_raw from v_pipe + 1));
  else
    v_day_part := v_raw;
    v_week_part := null;
  end if;

  if v_day_part = any (v_valid_days) then
    weekday := v_day_part;
  end if;

  if v_week_part is not null then
    if v_week_part ~ '^sandbox:\d+$' then
      v_idx := substring(v_week_part from 'sandbox:(\d+)')::int;
      sandbox_index := greatest(v_idx, 1);
      week_id := public.sandbox_week_id_from_index(sandbox_index);
    elsif v_week_part ~ '^\d{4}-\d{2}-\d{2}$' and public.is_sandbox_week_id(v_week_part) then
      week_id := v_week_part;
      sandbox_index := public.sandbox_index_from_week_id(v_week_part);
    end if;
  end if;

  return next;
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
  v_parsed record;
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

  select * into v_parsed from public.parse_tournament_override(p_override);

  if v_parsed.weekday is not null then
    v_weekday := v_parsed.weekday;
  end if;

  if v_parsed.week_id is not null then
    v_week_id := v_parsed.week_id;
  end if;

  return query select v_week_id, v_weekday;
end;
$$;

-- Sandbox weeks: slots always open (wide window around now) so playtests skip wall-clock waits.
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
  if public.is_sandbox_week_id(p_week_id)
     and public.get_game_config_bool('dev_mode', false) then
    return query select
      now() - interval '1 minute',
      now() + interval '2 hours';
    return;
  end if;

  v_hour := nullif(regexp_replace(p_slot_id, '\D', '', 'g'), '')::int;
  if v_hour is null then
    v_hour := 12;
  end if;

  v_gather_min := public.get_game_config_int('monday_gather_minutes', 5);

  return query select
    (p_week_id::date + make_interval(hours => v_hour, mins => v_minute)) at time zone 'UTC',
    (p_week_id::date + make_interval(hours => v_hour, mins => v_minute)
      + make_interval(mins => v_gather_min)) at time zone 'UTC';
end;
$$;

-- Optional: wipe current user's state for a sandbox week (dev only).
create or replace function public.dev_reset_my_week(p_override text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_week_id text;
  v_weekday text;
  v_sandbox int;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  if not public.get_game_config_bool('dev_mode', false) then
    raise exception 'dev_mode_disabled';
  end if;

  select t.week_id, t.weekday into v_week_id, v_weekday
  from public.current_tournament_day(p_override) t;

  if not public.is_sandbox_week_id(v_week_id) then
    raise exception 'not_sandbox_week';
  end if;

  v_sandbox := public.sandbox_index_from_week_id(v_week_id);

  delete from public.ready_votes
  where user_id = v_user and week_id = v_week_id;

  delete from public.pass_burns
  where user_id = v_user and week_id = v_week_id;

  delete from public.passes
  where user_id = v_user and week_id = v_week_id;

  delete from public.race_registrations
  where user_id = v_user and week_id = v_week_id;

  -- Detach from rooms tagged for this sandbox week (membership only).
  delete from public.room_members m
  using public.rooms r
  where m.room_id = r.id
    and m.user_id = v_user
    and r.week_id = v_week_id;

  return jsonb_build_object(
    'ok', true,
    'week_id', v_week_id,
    'weekday', v_weekday,
    'sandbox_index', v_sandbox
  );
end;
$$;

-- Surface sandbox index in week state for the client label.
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
  v_sandbox int;
begin
  if v_user is null then
    return jsonb_build_object('authenticated', false);
  end if;

  select t.week_id, t.weekday into v_week_id, v_weekday
  from public.current_tournament_day(p_override) t;

  v_sandbox := public.sandbox_index_from_week_id(v_week_id);

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
    'sandbox_index', v_sandbox,
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

grant execute on function public.is_sandbox_week_id(text) to authenticated;
grant execute on function public.sandbox_week_id_from_index(int) to authenticated;
grant execute on function public.sandbox_index_from_week_id(text) to authenticated;
grant execute on function public.parse_tournament_override(text) to authenticated;
grant execute on function public.dev_reset_my_week(text) to authenticated;
