-- BugEaters multiplayer schema.
-- Tiers: deterministic world needs no server state; rooms/members track the
-- lobby + results; race_events is the authoritative log written by the referee.

-- ---------------------------------------------------------------------------
-- profiles: one row per authenticated user, linked to a Telegram account.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  telegram_id bigint unique,
  username    text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- rooms: a single race. `seed` drives the deterministic obstacle/divider world
-- on every client; `starts_at` is the synchronized race start.
-- ---------------------------------------------------------------------------
create table if not exists public.rooms (
  id          uuid primary key default gen_random_uuid(),
  seed        bigint not null,
  phase       text not null default 'waiting'
              check (phase in ('waiting', 'countdown', 'racing', 'finished')),
  starts_at   timestamptz,
  day_key     text,
  max_players int not null default 9,
  created_at  timestamptz not null default now()
);

create index if not exists rooms_open_idx
  on public.rooms (phase, created_at)
  where phase in ('waiting', 'countdown');

-- ---------------------------------------------------------------------------
-- room_members: who is in a room, their assigned roster slot, and their result.
-- ---------------------------------------------------------------------------
create table if not exists public.room_members (
  room_id        uuid not null references public.rooms (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  character_type text not null check (character_type in ('bug', 'human', 'klaus')),
  global_sub_lane int not null,
  finished       boolean not null default false,
  finish_time_ms int,
  died           boolean not null default false,
  joined_at      timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists room_members_room_idx on public.room_members (room_id);

-- ---------------------------------------------------------------------------
-- race_events: authoritative event log (eliminations, etc.) written by the
-- referee Edge Function using the service role. Clients only read.
-- ---------------------------------------------------------------------------
create table if not exists public.race_events (
  id           bigint generated always as identity primary key,
  room_id      uuid not null references public.rooms (id) on delete cascade,
  type         text not null,
  actor_id     uuid,
  target_id    uuid,
  race_time_ms int,
  created_at   timestamptz not null default now()
);

create index if not exists race_events_room_idx on public.race_events (room_id, id);

-- Prevent the same target from being eliminated twice in a room.
create unique index if not exists race_events_unique_elim
  on public.race_events (room_id, target_id)
  where type = 'elimination';

-- ===========================================================================
-- Row Level Security
-- ===========================================================================
alter table public.profiles     enable row level security;
alter table public.rooms        enable row level security;
alter table public.room_members enable row level security;
alter table public.race_events  enable row level security;

-- Helper: is the current user a member of a given room?
create or replace function public.is_room_member(target_room uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.room_members m
    where m.room_id = target_room and m.user_id = auth.uid()
  );
$$;

-- profiles: anyone authenticated can read (usernames shown to rivals);
-- users manage only their own row. (Service role bypasses RLS.)
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_upsert on public.profiles;
create policy profiles_upsert on public.profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated using (id = auth.uid());

-- rooms: members read their room. Inserts/updates happen via Edge Functions
-- (service role), so no write policy is granted to clients.
drop policy if exists rooms_select on public.rooms;
create policy rooms_select on public.rooms
  for select to authenticated using (public.is_room_member(id));

-- room_members: read rows of rooms you belong to; update only your own row
-- (to report finish/death). Inserts are done by the join-room function.
drop policy if exists room_members_select on public.room_members;
create policy room_members_select on public.room_members
  for select to authenticated using (public.is_room_member(room_id));

drop policy if exists room_members_update_self on public.room_members;
create policy room_members_update_self on public.room_members
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- race_events: members read; only the referee (service role) writes.
drop policy if exists race_events_select on public.race_events;
create policy race_events_select on public.race_events
  for select to authenticated using (public.is_room_member(room_id));

-- ===========================================================================
-- Realtime: stream membership and authoritative events to clients.
-- ===========================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms'
  ) then
    alter publication supabase_realtime add table public.rooms;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_members'
  ) then
    alter publication supabase_realtime add table public.room_members;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'race_events'
  ) then
    alter publication supabase_realtime add table public.race_events;
  end if;
end $$;
