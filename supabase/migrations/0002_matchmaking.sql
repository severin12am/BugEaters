-- Atomic matchmaking: find an open room with a free roster slot for the chosen
-- character, otherwise create a new room with a fresh seed and a synchronized
-- start time. Runs as the caller (auth.uid()) via security definer.

-- One player per sub-lane within a room.
alter table public.room_members
  drop constraint if exists room_members_unique_lane;
alter table public.room_members
  add constraint room_members_unique_lane unique (room_id, global_sub_lane);

create or replace function public.join_or_create_room(
  p_character text,
  p_lobby_seconds int default 12
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

  -- Already waiting in an open room? Return the existing assignment.
  select r.* into v_room
  from public.rooms r
  join public.room_members m on m.room_id = r.id
  where m.user_id = v_user and r.phase in ('waiting', 'countdown')
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

  -- Find an open, non-full room with a free slot in this character's range.
  for v_room in
    select r.*
    from public.rooms r
    where r.phase in ('waiting', 'countdown')
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

  -- No room available: create a fresh one and start the lobby countdown.
  v_seed := floor(random() * 2147483647)::bigint;
  insert into public.rooms (seed, phase, starts_at)
  values (v_seed, 'countdown', now() + make_interval(secs => p_lobby_seconds))
  returning * into v_room;

  insert into public.room_members (room_id, user_id, character_type, global_sub_lane)
  values (v_room.id, v_user, p_character, v_low);

  return query
    select v_room.id, v_room.seed, v_room.starts_at, v_room.phase, v_low, now();
end;
$$;

grant execute on function public.join_or_create_room(text, int) to authenticated;

-- Mark a room as racing once its start time has passed (idempotent helper the
-- referee / clients can call). Only advances forward.
create or replace function public.mark_room_racing(p_room uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.rooms
  set phase = 'racing'
  where id = p_room and phase = 'countdown' and starts_at <= now();
$$;

grant execute on function public.mark_room_racing(uuid) to authenticated;
