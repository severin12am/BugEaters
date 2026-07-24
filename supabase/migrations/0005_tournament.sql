-- Tournament schema: passes, registrations, config, room extensions.

create table if not exists public.game_config (
  key text primary key,
  value jsonb not null
);

insert into public.game_config (key, value) values
  ('max_saturday_rooms', '6'),
  ('min_players', '1'),
  ('species_ratio', '[3,2,1]'),
  ('advancement_low_threshold', '8'),
  ('advancement_medium_threshold', '20'),
  ('dev_mode', 'true')
on conflict (key) do nothing;

create table if not exists public.tournament_weeks (
  week_id text primary key,
  status text not null default 'active' check (status in ('active', 'finished')),
  champion_user_id uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists wallet_address text;
alter table public.profiles add column if not exists wallet_linked_at timestamptz;

create table if not exists public.passes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_id text not null,
  grants_entry text not null check (grants_entry in (
    'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
  )),
  won_on text not null,
  nft_address text,
  status text not null default 'active' check (status in ('active', 'burned', 'expired')),
  created_at timestamptz not null default now()
);

create index if not exists passes_user_week_status_idx
  on public.passes (user_id, week_id, status);

create table if not exists public.pass_burns (
  id uuid primary key default gen_random_uuid(),
  pass_id uuid not null references public.passes (id) unique,
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_id text not null,
  weekday text not null,
  room_id uuid not null references public.rooms (id) on delete cascade,
  tx_hash text,
  burned_at timestamptz not null default now()
);

create table if not exists public.sunday_passes (
  week_id text not null,
  slot int not null check (slot between 1 and 6),
  pass_id uuid not null references public.passes (id),
  saturday_room_id uuid not null references public.rooms (id) unique,
  primary key (week_id, slot)
);

create table if not exists public.race_registrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_id text not null,
  slot_id text not null,
  character_type text not null,
  created_at timestamptz not null default now(),
  unique (user_id, week_id)
);

create table if not exists public.ready_votes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_id text not null,
  weekday text not null,
  created_at timestamptz not null default now(),
  unique (user_id, week_id, weekday)
);

create table if not exists public.billboard_entitlements (
  week_id text primary key,
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  transferred_to uuid references public.profiles (id),
  creative_url text,
  approved boolean not null default false
);

alter table public.rooms add column if not exists week_id text;
alter table public.rooms add column if not exists weekday text;
alter table public.rooms add column if not exists results_recorded_at timestamptz;

alter table public.room_members add column if not exists assigned_species text;
alter table public.room_members add column if not exists pass_id uuid references public.passes (id);

-- ===========================================================================
-- Row Level Security
-- ===========================================================================
alter table public.game_config enable row level security;
alter table public.tournament_weeks enable row level security;
alter table public.passes enable row level security;
alter table public.pass_burns enable row level security;
alter table public.sunday_passes enable row level security;
alter table public.race_registrations enable row level security;
alter table public.ready_votes enable row level security;
alter table public.billboard_entitlements enable row level security;

drop policy if exists game_config_select on public.game_config;
create policy game_config_select on public.game_config
  for select to authenticated using (true);

drop policy if exists tournament_weeks_select on public.tournament_weeks;
create policy tournament_weeks_select on public.tournament_weeks
  for select to authenticated using (true);

drop policy if exists passes_select_own on public.passes;
create policy passes_select_own on public.passes
  for select to authenticated using (user_id = auth.uid());

drop policy if exists pass_burns_select_own on public.pass_burns;
create policy pass_burns_select_own on public.pass_burns
  for select to authenticated using (user_id = auth.uid());

drop policy if exists sunday_passes_select on public.sunday_passes;
create policy sunday_passes_select on public.sunday_passes
  for select to authenticated using (true);

drop policy if exists race_registrations_select_own on public.race_registrations;
create policy race_registrations_select_own on public.race_registrations
  for select to authenticated using (user_id = auth.uid());

drop policy if exists ready_votes_select on public.ready_votes;
create policy ready_votes_select on public.ready_votes
  for select to authenticated using (true);

drop policy if exists billboard_entitlements_select on public.billboard_entitlements;
create policy billboard_entitlements_select on public.billboard_entitlements
  for select to authenticated using (true);
