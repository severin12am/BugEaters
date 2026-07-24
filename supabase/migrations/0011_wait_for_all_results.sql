-- Do not finalize a room while another player is still reporting their
-- outcome. Previously, the first client to reach EndScene could permanently
-- record every slower client as eliminated.
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
      'outcome', case
        when v_room.weekday = 'sunday' and exists (
          select 1 from public.tournament_weeks tw
          where tw.week_id = v_room.week_id and tw.champion_user_id = v_user
        ) then 'champion'
        when v_my_pass_id is not null then
          case when v_room.weekday = 'saturday' then 'sunday_pass' else 'advanced' end
        else 'eliminated'
      end,
      'pass_id', v_my_pass_id
    );
  end if;

  -- `finished=false,died=false` means this client has not reported yet.
  -- Hold the transaction open only long enough to return pending; EndScene
  -- retries instead of freezing an incorrect placement permanently.
  if exists (
    select 1
    from public.room_members m
    where m.room_id = p_room_id
      and not m.finished
      and not m.died
  ) then
    return jsonb_build_object('outcome', 'pending');
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
  elsif v_weekday in ('friday', 'saturday') then
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
        set champion_user_id = v_member.user_id, status = 'finished'
        where week_id = v_week_id;
        insert into public.billboard_entitlements (week_id, owner_user_id)
        values (v_week_id, v_member.user_id)
        on conflict (week_id) do update set owner_user_id = excluded.owner_user_id;
        if v_member.user_id = v_user then
          v_my_outcome := 'champion';
        end if;
      end if;
      continue;
    end if;

    if not v_member.finished or v_member.died or v_member.placement > v_top_k or v_next_entry is null then
      continue;
    end if;

    insert into public.passes (user_id, week_id, grants_entry, won_on, nft_address)
    values (v_member.user_id, v_week_id, v_next_entry, v_weekday, 'mock:' || gen_random_uuid()::text)
    returning id into v_pass_id;
    v_awarded := array_append(v_awarded, v_pass_id);

    if v_weekday = 'saturday' and v_next_entry = 'sunday' then
      select coalesce(max(sp.slot), 0) + 1 into v_slot
      from public.sunday_passes sp where sp.week_id = v_week_id;
      if v_slot <= public.get_game_config_int('max_saturday_rooms', 6) then
        insert into public.sunday_passes (week_id, slot, pass_id, saturday_room_id)
        values (v_week_id, v_slot, v_pass_id, p_room_id) on conflict do nothing;
        if v_member.user_id = v_user then
          v_sunday_slot := v_slot;
        end if;
      end if;
    end if;

    if v_member.user_id = v_user then
      v_my_outcome := case when v_weekday = 'saturday' then 'sunday_pass' else 'advanced' end;
      v_my_pass_id := v_pass_id;
    end if;
  end loop;

  update public.rooms set results_recorded_at = now() where id = p_room_id;
  return jsonb_build_object(
    'outcome', v_my_outcome,
    'pass_id', v_my_pass_id,
    'grants_entry', v_next_entry,
    'sunday_slot', v_sunday_slot,
    'awarded_count', coalesce(array_length(v_awarded, 1), 0)
  );
end;
$$;
