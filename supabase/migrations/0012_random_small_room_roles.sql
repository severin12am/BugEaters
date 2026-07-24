-- Small rooms previously used fixed compositions:
-- 1 player = Bug, 2 players = Bug + Human. Klaus therefore had zero chance
-- until a third person joined. Draw each room from the 3:2:1 roster instead.
create or replace function public.assign_roles(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_n int;
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

  -- Shuffle a full 3 Bug : 2 Human : 1 Klaus roster, then use only the
  -- number of slots the room actually has. This preserves the intended ratio
  -- over the tournament while allowing Klaus in solo and two-player rooms.
  perform setseed(
    abs(hashtext(coalesce(v_room.week_id, '') || v_room.id::text))::float / 2147483647
  );
  select array_agg(species order by random())
  into v_species
  from unnest(array['bug', 'bug', 'bug', 'human', 'human', 'klaus']::text[]) species;
  v_species := v_species[1:v_n];

  -- Move existing slots away from the 0–8 unique range before assigning the
  -- new species lanes, avoiding a temporary uniqueness collision.
  update public.room_members m
  set global_sub_lane = 100 + sub.rn
  from (
    select user_id, row_number() over (order by joined_at) as rn
    from public.room_members
    where room_id = p_room_id
  ) sub
  where m.room_id = p_room_id and m.user_id = sub.user_id;

  for v_member in
    select user_id
    from public.room_members
    where room_id = p_room_id
    order by joined_at
  loop
    if v_species[v_idx] = 'bug' then
      v_lane := v_bug_used;
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
