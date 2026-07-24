-- Finish a room once the race window has elapsed. Any member may call it; the
-- time guard prevents ending the room early. Idempotent.
create or replace function public.mark_room_finished(p_room uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.rooms
  set phase = 'finished'
  where id = p_room
    and phase <> 'finished'
    and (starts_at is null or now() >= starts_at + make_interval(secs => 70));
$$;

grant execute on function public.mark_room_finished(uuid) to authenticated;
