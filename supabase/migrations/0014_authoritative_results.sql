-- Dedicated race servers are the only writers of final room standings.
-- This RPC intentionally has no authenticated-user grant; race-results Edge
-- Function invokes it with the service role after HMAC verification.
create or replace function public.record_authoritative_results(
  p_room_id uuid,
  p_results jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_week_id text;
  v_weekday text;
  v_ready_count int;
  v_low_threshold int;
  v_top_k int;
  v_next_entry text;
  v_member record;
  v_slot int;
  v_pass_id uuid;
  v_awarded int := 0;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if v_room.id is null then raise exception 'room not found'; end if;
  if v_room.results_recorded_at is not null then
    return jsonb_build_object('already_recorded', true);
  end if;
  if jsonb_typeof(p_results) <> 'array' then raise exception 'results must be an array'; end if;

  -- A result must be supplied for every member, and no outsider can appear.
  if (select count(*) from public.room_members where room_id = p_room_id)
     <> jsonb_array_length(p_results)
     or exists (
       select 1
       from jsonb_to_recordset(p_results) as r(user_id uuid, finished boolean, died boolean, finish_time_ms int)
       where not exists (
         select 1 from public.room_members m where m.room_id = p_room_id and m.user_id = r.user_id
       )
     ) then
    raise exception 'result roster does not match room';
  end if;

  update public.room_members m
  set finished = r.finished,
      died = r.died,
      finish_time_ms = case when r.finished and not r.died then r.finish_time_ms else null end
  from jsonb_to_recordset(p_results) as r(user_id uuid, finished boolean, died boolean, finish_time_ms int)
  where m.room_id = p_room_id and m.user_id = r.user_id;

  v_week_id := v_room.week_id;
  v_weekday := v_room.weekday;
  update public.rooms set phase = 'finished' where id = p_room_id;

  if v_weekday = 'monday' then
    update public.race_registrations
    set raced_at = now()
    where week_id = v_week_id
      and user_id in (
        select user_id from public.room_members
        where room_id = p_room_id and (finished or died)
      );
    select count(*) into v_ready_count from public.race_registrations where week_id = v_week_id;
  else
    select count(*) into v_ready_count from public.ready_votes where week_id = v_week_id and weekday = v_weekday;
  end if;

  v_low_threshold := public.get_game_config_int('advancement_low_threshold', 8);
  if v_weekday in ('monday', 'tuesday') and v_ready_count < v_low_threshold then
    v_top_k := 999;
  elsif v_weekday in ('monday', 'tuesday') then
    v_top_k := 3;
  elsif v_weekday in ('wednesday', 'thursday') then
    v_top_k := 2;
  elsif v_weekday in ('friday', 'saturday') then
    v_top_k := 1;
  else
    v_top_k := 0;
  end if;
  v_next_entry := public.next_grants_entry(v_weekday);

  for v_member in
    select m.user_id, m.finished, m.died,
      row_number() over (
        order by case when m.finished and not m.died then 0 else 1 end,
        coalesce(m.finish_time_ms, 2147483647)
      ) as placement
    from public.room_members m where m.room_id = p_room_id
  loop
    if v_weekday = 'sunday' then
      if v_member.placement = 1 and v_member.finished and not v_member.died then
        perform public.ensure_tournament_week(v_week_id);
        update public.tournament_weeks
        set champion_user_id = v_member.user_id, status = 'finished'
        where week_id = v_week_id;
        insert into public.billboard_entitlements (week_id, owner_user_id)
        values (v_week_id, v_member.user_id)
        on conflict (week_id) do update set owner_user_id = excluded.owner_user_id;
      end if;
      continue;
    end if;
    if not v_member.finished or v_member.died or v_member.placement > v_top_k or v_next_entry is null then
      continue;
    end if;
    insert into public.passes (user_id, week_id, grants_entry, won_on, nft_address)
    values (v_member.user_id, v_week_id, v_next_entry, v_weekday, 'mock:' || gen_random_uuid()::text)
    returning id into v_pass_id;
    v_awarded := v_awarded + 1;
    if v_weekday = 'saturday' and v_next_entry = 'sunday' then
      select coalesce(max(slot), 0) + 1 into v_slot from public.sunday_passes where week_id = v_week_id;
      if v_slot <= public.get_game_config_int('max_saturday_rooms', 6) then
        insert into public.sunday_passes (week_id, slot, pass_id, saturday_room_id)
        values (v_week_id, v_slot, v_pass_id, p_room_id) on conflict do nothing;
      end if;
    end if;
  end loop;

  update public.rooms set results_recorded_at = now() where id = p_room_id;
  return jsonb_build_object('awarded_count', v_awarded);
end;
$$;

revoke all on function public.record_authoritative_results(uuid, jsonb) from public;
