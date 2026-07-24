-- A speed boost can reach the visual finish distance before the shared
-- 60-second tournament window ends. Results must never be sealed before that
-- server-clock boundary, even in a solo room.
alter function public.record_results(uuid, text)
  rename to record_results_after_all_reports;

create function public.record_results(
  p_room_id uuid,
  p_override text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
begin
  select * into v_room
  from public.rooms
  where id = p_room_id;

  if v_room.id is null then
    raise exception 'room not found';
  end if;

  if v_room.results_recorded_at is null
     and v_room.starts_at is not null
     and now() < v_room.starts_at + make_interval(secs => 60) then
    return jsonb_build_object('outcome', 'pending');
  end if;

  return public.record_results_after_all_reports(p_room_id, p_override);
end;
$$;

grant execute on function public.record_results(uuid, text) to authenticated;
