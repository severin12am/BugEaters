-- 0015 — Real TON pass NFTs.
--
-- Before this migration a pass was a database row with a fake `nft_address`
-- ('mock:<uuid>'). Now a pass row is the *award*; the NFT is minted afterwards
-- by the race server (server/src/ton/NftMinter.ts) to the winner's linked
-- wallet, and "burn to enter" moves the item to the burn address on TON.
--
--   award (record_results*)  →  passes.mint_status = 'pending'
--   minter                   →  'minting' → 'minted' (nft_address, nft_index)
--   lobby "Burn & ready"     →  TON transfer → burn address, verified by the
--                               confirm-burn edge function → pass_burns
--
-- Product law honoured: I3/I4 (week-scoped, one pass = one race), I5 (burn in
-- lobby), I17 (one wallet per user, forfeit when never linked).

-- ---------------------------------------------------------------------------
-- Config
-- ---------------------------------------------------------------------------
insert into public.game_config (key, value) values
  ('ton_network', '"testnet"'),
  ('nft_collection_address', 'null'),
  ('nft_burn_address', '"0:0000000000000000000000000000000000000000000000000000000000000000"'),
  -- false = passes may still be burned DB-only (playtest / before the collection
  -- is deployed). true = a minted pass MUST be burned on-chain to race.
  ('pass_required_onchain', 'false'),
  -- I17: Monday winners must link a wallet within this window or forfeit.
  ('wallet_link_deadline_hours', '24')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
alter table public.passes add column if not exists mint_status text not null default 'pending'
  check (mint_status in ('pending', 'minting', 'minted', 'failed', 'skipped'));
alter table public.passes add column if not exists nft_index bigint;
alter table public.passes add column if not exists owner_wallet text;
alter table public.passes add column if not exists mint_attempts int not null default 0;
alter table public.passes add column if not exists mint_error text;
alter table public.passes add column if not exists minted_at timestamptz;

create index if not exists passes_mint_queue_idx
  on public.passes (created_at) where mint_status in ('pending', 'failed');
create unique index if not exists passes_nft_address_uidx
  on public.passes (nft_address) where nft_address is not null;

-- One TON wallet per Telegram user (I17).
create unique index if not exists profiles_wallet_address_uidx
  on public.profiles (wallet_address) where wallet_address is not null;

alter table public.tournament_weeks add column if not exists champion_nft_address text;
alter table public.tournament_weeks add column if not exists champion_nft_index bigint;
alter table public.tournament_weeks add column if not exists champion_mint_status text not null default 'pending'
  check (champion_mint_status in ('pending', 'minting', 'minted', 'failed', 'skipped'));
alter table public.tournament_weeks add column if not exists champion_mint_attempts int not null default 0;
alter table public.tournament_weeks add column if not exists champion_mint_error text;
alter table public.tournament_weeks add column if not exists champion_minted_at timestamptz;

-- The awarding RPCs (0011 / 0014) still write 'mock:<uuid>'. The address is now
-- assigned by the minter, so normalise every insert into a pending mint.
create or replace function public.passes_normalize_nft()
returns trigger
language plpgsql
as $$
begin
  if new.nft_address is null or new.nft_address like 'mock:%' then
    new.nft_address := null;
    new.mint_status := 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists passes_normalize_nft on public.passes;
create trigger passes_normalize_nft
  before insert on public.passes
  for each row execute function public.passes_normalize_nft();

-- Existing mock rows become pending mints too.
update public.passes
set nft_address = null, mint_status = 'pending'
where nft_address like 'mock:%';

-- ---------------------------------------------------------------------------
-- Wallet link
-- ---------------------------------------------------------------------------
-- The client-callable link_wallet now only works in dev_mode (mock wallet for
-- playtests). Production links go through the link-wallet edge function, which
-- verifies TON Connect `ton_proof` and calls link_wallet_verified as service role.
create or replace function public.link_wallet(p_address text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not public.get_game_config_bool('dev_mode', false) then
    raise exception 'proof_required';
  end if;
  return public.link_wallet_verified(v_user, p_address);
end;
$$;

create or replace function public.link_wallet_verified(p_user uuid, p_address text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing text;
  v_other uuid;
begin
  if p_user is null then
    raise exception 'not authenticated';
  end if;
  if p_address is null or length(trim(p_address)) = 0 then
    raise exception 'invalid address';
  end if;

  select id into v_other from public.profiles where wallet_address = p_address and id <> p_user;
  if v_other is not null then
    raise exception 'wallet_in_use';
  end if;

  select wallet_address into v_existing from public.profiles where id = p_user;

  update public.profiles
  set wallet_address = p_address,
      wallet_linked_at = case when v_existing = p_address then wallet_linked_at else now() end
  where id = p_user;

  return jsonb_build_object('address', p_address, 'relinked', v_existing is not null and v_existing <> p_address);
end;
$$;

create or replace function public.unlink_wallet()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  update public.profiles set wallet_address = null, wallet_linked_at = null where id = v_user;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Burn (lobby gate)
-- ---------------------------------------------------------------------------
create or replace function public.confirm_pass_burn_internal(
  p_user uuid,
  p_room_id uuid,
  p_pass_id uuid,
  p_tx_hash text,
  p_override text,
  p_verified boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week_id text;
  v_weekday text;
  v_pass public.passes%rowtype;
  v_existing uuid;
begin
  if p_user is null then
    raise exception 'not authenticated';
  end if;

  select t.week_id, t.weekday into v_week_id, v_weekday
  from public.current_tournament_day(p_override) t;

  if v_weekday = 'monday' then
    return jsonb_build_object('skipped', true, 'weekday', v_weekday);
  end if;

  select pass_id into v_existing
  from public.pass_burns
  where room_id = p_room_id and user_id = p_user;

  if v_existing is not null then
    return jsonb_build_object('pass_id', v_existing, 'already_burned', true);
  end if;

  select * into v_pass
  from public.passes
  where user_id = p_user
    and week_id = v_week_id
    and grants_entry = v_weekday
    and status = 'active'
    and (p_pass_id is null or id = p_pass_id)
  order by created_at
  limit 1
  for update;

  if v_pass.id is null then
    raise exception 'no_pass';
  end if;

  -- A pass that exists on TON must leave the wallet for real.
  if not p_verified
     and v_pass.mint_status = 'minted'
     and public.get_game_config_bool('pass_required_onchain', false) then
    raise exception 'onchain_burn_required';
  end if;

  update public.passes set status = 'burned' where id = v_pass.id;

  insert into public.pass_burns (pass_id, user_id, week_id, weekday, room_id, tx_hash)
  values (v_pass.id, p_user, v_week_id, v_weekday, p_room_id, p_tx_hash);

  update public.room_members
  set pass_id = v_pass.id
  where room_id = p_room_id and user_id = p_user;

  return jsonb_build_object(
    'pass_id', v_pass.id,
    'weekday', v_weekday,
    'onchain', p_verified,
    'nft_address', v_pass.nft_address
  );
end;
$$;

-- Client path (DB-only burn; refused for minted passes when on-chain mode is on).
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
begin
  return public.confirm_pass_burn_internal(auth.uid(), p_room_id, null, p_tx_hash, p_override, false);
end;
$$;

-- Edge-function path (service role) after the item was seen at the burn address.
create or replace function public.confirm_pass_burn_verified(
  p_user uuid,
  p_room_id uuid,
  p_pass_id uuid,
  p_tx_hash text,
  p_override text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.confirm_pass_burn_internal(p_user, p_room_id, p_pass_id, p_tx_hash, p_override, true);
end;
$$;

-- Leaving the lobby before start refunds DB-only burns. An on-chain burn
-- (tx_hash 'ton:…') is irreversible: the NFT is gone, so the pass stays burned
-- (APP_MASTER_SPEC §4 pass_burn_refund_on_abort = false).
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
  if v_burn.tx_hash like 'ton:%' then
    return;
  end if;

  update public.passes set status = 'active' where id = v_burn.pass_id;
  delete from public.pass_burns where id = v_burn.id;

  update public.room_members
  set pass_id = null, assigned_species = null
  where room_id = p_room_id and user_id = v_user;
end;
$$;

-- ---------------------------------------------------------------------------
-- Secondary market: a pass bought on Getgems shows up in the buyer's wallet.
-- The sync-passes edge function verifies on-chain ownership, then re-homes the
-- row. Only active (unburned) passes can move.
-- ---------------------------------------------------------------------------
create or replace function public.claim_pass_by_nft(p_user uuid, p_nft_address text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pass public.passes%rowtype;
  v_wallet text;
begin
  if p_user is null then
    raise exception 'not authenticated';
  end if;
  select wallet_address into v_wallet from public.profiles where id = p_user;
  if v_wallet is null then
    raise exception 'no_wallet';
  end if;

  select * into v_pass from public.passes where nft_address = p_nft_address for update;
  if v_pass.id is null then
    return jsonb_build_object('claimed', false, 'reason', 'unknown_nft');
  end if;
  if v_pass.status <> 'active' then
    return jsonb_build_object('claimed', false, 'reason', 'not_active');
  end if;
  if v_pass.user_id = p_user then
    return jsonb_build_object('claimed', false, 'reason', 'already_owner', 'pass_id', v_pass.id);
  end if;

  update public.passes
  set user_id = p_user, owner_wallet = v_wallet
  where id = v_pass.id;

  return jsonb_build_object(
    'claimed', true,
    'pass_id', v_pass.id,
    'week_id', v_pass.week_id,
    'grants_entry', v_pass.grants_entry
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Mint queue (service role only — called by the race server minter)
-- ---------------------------------------------------------------------------
create or replace function public.nft_pending_mints(p_limit int default 10)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'pass_id', p.id,
    'user_id', p.user_id,
    'week_id', p.week_id,
    'grants_entry', p.grants_entry,
    'won_on', p.won_on,
    'wallet_address', pr.wallet_address,
    'planned_address', p.nft_address
  ) order by p.created_at), '[]'::jsonb)
  from (
    select p.*
    from public.passes p
    join public.profiles pr on pr.id = p.user_id
    where p.status = 'active'
      and p.mint_status in ('pending', 'failed')
      and p.mint_attempts < 6
      and pr.wallet_address is not null
    order by p.created_at
    limit greatest(1, least(p_limit, 50))
  ) p
  join public.profiles pr on pr.id = p.user_id;
$$;

create or replace function public.nft_mark_minting(p_pass_id uuid, p_address text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update public.passes
  set mint_status = 'minting',
      nft_address = p_address,
      mint_attempts = mint_attempts + 1,
      mint_error = null
  where id = p_pass_id
    and status = 'active'
    and mint_status in ('pending', 'failed');
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

create or replace function public.nft_mark_minted(
  p_pass_id uuid,
  p_address text,
  p_index bigint,
  p_owner_wallet text
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.passes
  set mint_status = 'minted',
      nft_address = p_address,
      nft_index = p_index,
      owner_wallet = p_owner_wallet,
      minted_at = now(),
      mint_error = null
  where id = p_pass_id;
$$;

create or replace function public.nft_mark_failed(p_pass_id uuid, p_error text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.passes
  set mint_status = 'failed',
      mint_error = p_error
  where id = p_pass_id and mint_status <> 'minted';
$$;

create or replace function public.nft_pending_champions(p_limit int default 3)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'week_id', tw.week_id,
    'user_id', tw.champion_user_id,
    'wallet_address', pr.wallet_address,
    'planned_address', tw.champion_nft_address
  ) order by tw.created_at), '[]'::jsonb)
  from (
    select *
    from public.tournament_weeks tw
    where tw.champion_user_id is not null
      and tw.champion_mint_status in ('pending', 'failed')
      and tw.champion_mint_attempts < 6
    order by tw.created_at
    limit greatest(1, least(p_limit, 20))
  ) tw
  join public.profiles pr on pr.id = tw.champion_user_id
  where pr.wallet_address is not null;
$$;

create or replace function public.nft_mark_champion_minting(p_week_id text, p_address text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update public.tournament_weeks
  set champion_mint_status = 'minting',
      champion_nft_address = p_address,
      champion_mint_attempts = champion_mint_attempts + 1,
      champion_mint_error = null
  where week_id = p_week_id
    and champion_mint_status in ('pending', 'failed');
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

create or replace function public.nft_mark_champion_minted(p_week_id text, p_address text, p_index bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update public.tournament_weeks
  set champion_mint_status = 'minted',
      champion_nft_address = p_address,
      champion_nft_index = p_index,
      champion_minted_at = now(),
      champion_mint_error = null
  where week_id = p_week_id;
$$;

create or replace function public.nft_mark_champion_failed(p_week_id text, p_error text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.tournament_weeks
  set champion_mint_status = 'failed',
      champion_mint_error = p_error
  where week_id = p_week_id and champion_mint_status <> 'minted';
$$;

-- I17: a pass never minted because its winner never linked a wallet within the
-- deadline is forfeited. Only unminted, still-active passes are affected.
create or replace function public.expire_unlinked_passes()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hours int := public.get_game_config_int('wallet_link_deadline_hours', 24);
  v_count int;
begin
  update public.passes p
  set status = 'expired',
      mint_status = 'skipped',
      mint_error = 'forfeit: wallet not linked within deadline'
  from public.profiles pr
  where pr.id = p.user_id
    and p.status = 'active'
    and p.mint_status in ('pending', 'failed')
    and pr.wallet_address is null
    and p.created_at < now() - make_interval(hours => v_hours);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Week state — expose NFT status + chain config to the client.
-- ---------------------------------------------------------------------------
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
  v_champion_nft text;
  v_champion_mint text;
  v_billboard_creative text;
  v_billboard_transferred uuid;
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
    'status', p.status,
    'nft_address', p.nft_address,
    'nft_index', p.nft_index,
    'mint_status', p.mint_status
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

  select tw.champion_user_id, tw.champion_nft_address, tw.champion_mint_status
  into v_champion, v_champion_nft, v_champion_mint
  from public.tournament_weeks tw where tw.week_id = v_week_id;

  v_is_champion := v_champion = v_user;

  if v_is_champion then
    select be.creative_url, be.transferred_to
    into v_billboard_creative, v_billboard_transferred
    from public.billboard_entitlements be where be.week_id = v_week_id;
  end if;

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
    'champion_billboard_active', v_billboard,
    'champion_nft_address', case when v_is_champion then v_champion_nft else null end,
    'champion_mint_status', case when v_is_champion then v_champion_mint else null end,
    'billboard_creative_url', v_billboard_creative,
    'billboard_transferred_to', v_billboard_transferred,
    'chain', jsonb_build_object(
      'network', public.get_game_config_value('ton_network'),
      'collection_address', public.get_game_config_value('nft_collection_address'),
      'burn_address', public.get_game_config_value('nft_burn_address'),
      'pass_required_onchain', public.get_game_config_bool('pass_required_onchain', false),
      'dev_mode', public.get_game_config_bool('dev_mode', false)
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant execute on function public.link_wallet(text) to authenticated;
grant execute on function public.unlink_wallet() to authenticated;
grant execute on function public.confirm_pass_burn(uuid, text, text) to authenticated;
grant execute on function public.refund_pass_burn(uuid) to authenticated;
grant execute on function public.get_my_week_state(text) to authenticated;

-- Service-role only: verified link / burn, market claims, mint queue.
revoke all on function public.link_wallet_verified(uuid, text) from public;
revoke all on function public.confirm_pass_burn_internal(uuid, uuid, uuid, text, text, boolean) from public;
revoke all on function public.confirm_pass_burn_verified(uuid, uuid, uuid, text, text) from public;
revoke all on function public.claim_pass_by_nft(uuid, text) from public;
revoke all on function public.nft_pending_mints(int) from public;
revoke all on function public.nft_mark_minting(uuid, text) from public;
revoke all on function public.nft_mark_minted(uuid, text, bigint, text) from public;
revoke all on function public.nft_mark_failed(uuid, text) from public;
revoke all on function public.nft_pending_champions(int) from public;
revoke all on function public.nft_mark_champion_minting(text, text) from public;
revoke all on function public.nft_mark_champion_minted(text, text, bigint) from public;
revoke all on function public.nft_mark_champion_failed(text, text) from public;
revoke all on function public.expire_unlinked_passes() from public;

grant execute on function public.link_wallet_verified(uuid, text) to service_role;
grant execute on function public.confirm_pass_burn_internal(uuid, uuid, uuid, text, text, boolean) to service_role;
grant execute on function public.confirm_pass_burn_verified(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.claim_pass_by_nft(uuid, text) to service_role;
grant execute on function public.nft_pending_mints(int) to service_role;
grant execute on function public.nft_mark_minting(uuid, text) to service_role;
grant execute on function public.nft_mark_minted(uuid, text, bigint, text) to service_role;
grant execute on function public.nft_mark_failed(uuid, text) to service_role;
grant execute on function public.nft_pending_champions(int) to service_role;
grant execute on function public.nft_mark_champion_minting(text, text) to service_role;
grant execute on function public.nft_mark_champion_minted(text, text, bigint) to service_role;
grant execute on function public.nft_mark_champion_failed(text, text) to service_role;
grant execute on function public.expire_unlinked_passes() to service_role;
