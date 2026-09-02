import { ensureSession } from '../net/auth';
import { getSupabase } from '../net/supabaseClient';
import type { ChainService } from './chain/ChainService';
import type { ChainConfig, PassChip, PassMintStatus, TournamentWeekday, WeekContext } from './types';
import { getDevOverrideParam, getWeekContext as buildLocalWeekContext, KEY_MAP, LABEL_MAP } from './weekClock';

export type BlockReason =
  | 'no-pass'
  | 'no-wallet'
  | 'wrong-day'
  | 'forfeit'
  | 'not_registered'
  | 'saturday_full'
  | 'no_sunday_pass'
  | 'not_ready'
  | 'already_raced'
  | 'slot_not_open'
  | 'slot_closed';

export interface WeekState {
  authenticated: boolean;
  weekId: string;
  weekday: TournamentWeekday;
  /** Present when week is a sandbox playtest week. */
  sandboxIndex: number | null;
  walletAddress: string | null;
  walletLinked: boolean;
  passes: PassChip[];
  registration: {
    slot_id: string;
    character_type: string;
    raced_at: string | null;
    opens_at?: string;
    closes_at?: string;
  } | null;
  readyCount: number;
  isChampion: boolean;
  championBillboardActive: boolean;
  /** Champion token (only filled for the champion). */
  championNftAddress: string | null;
  championMintStatus: PassMintStatus | null;
  billboardCreativeUrl: string | null;
  billboardTransferredTo: string | null;
  chain: ChainConfig;
}

export const DEFAULT_CHAIN_CONFIG: ChainConfig = {
  network: 'testnet',
  collectionAddress: null,
  burnAddress: null,
  passRequiredOnchain: false,
  devMode: false,
};

export interface RaceOutcome {
  outcome: 'advanced' | 'eliminated' | 'champion' | 'sunday_pass' | 'pending';
  passId?: string | null;
  grantsEntry?: string | null;
  sundaySlot?: number | null;
  alreadyRecorded?: boolean;
}

export interface SundayFinalist {
  slot: number;
  userId: string;
  username: string | null;
}

function devOverride(): string | null {
  return getDevOverrideParam();
}

function mapPass(row: {
  id: string;
  grants_entry: string;
  won_on: string;
  week_id: string;
  nft_address?: string | null;
  nft_index?: number | string | null;
  mint_status?: string | null;
}): PassChip {
  return {
    id: row.id,
    grantsEntry: row.grants_entry as TournamentWeekday,
    wonOn: row.won_on as TournamentWeekday,
    weekId: row.week_id,
    nftAddress: row.nft_address ?? null,
    nftIndex: row.nft_index === null || row.nft_index === undefined ? null : Number(row.nft_index),
    mintStatus: (row.mint_status as PassMintStatus | undefined) ?? 'pending',
  };
}

function mapChain(raw: Record<string, unknown> | null | undefined): ChainConfig {
  if (!raw) {
    return DEFAULT_CHAIN_CONFIG;
  }
  return {
    network: raw.network === 'mainnet' ? 'mainnet' : 'testnet',
    collectionAddress: typeof raw.collection_address === 'string' ? raw.collection_address : null,
    burnAddress: typeof raw.burn_address === 'string' ? raw.burn_address : null,
    passRequiredOnchain: Boolean(raw.pass_required_onchain),
    devMode: Boolean(raw.dev_mode),
  };
}

/**
 * Calls a Supabase Edge Function and surfaces its `{ error }` body as an Error
 * whose message is the machine code (e.g. 'no_wallet', 'burn_not_visible').
 */
export async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('supabase not configured');
  }
  const auth = await ensureSession();
  if (!auth.session) {
    throw new Error('not_authenticated');
  }
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      let payload: { error?: string } | null = null;
      try {
        payload = (await context.clone().json()) as { error?: string };
      } catch {
        payload = null;
      }
      if (context.status === 404 && !payload?.error) {
        throw new Error(`function_missing:${name}`);
      }
      throw new Error(payload?.error ?? `${name} failed (${context.status})`);
    }
    throw new Error(error.message ?? `${name} failed`);
  }
  if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
    throw new Error(String((data as { error: string }).error));
  }
  return data as T;
}

function parseRpcError(message: string): BlockReason | null {
  const code = message.toLowerCase();
  if (code.includes('no_wallet')) return 'no-wallet';
  if (code.includes('no_pass')) return 'no-pass';
  if (code.includes('not_registered')) return 'not_registered';
  if (code.includes('saturday_full')) return 'saturday_full';
  if (code.includes('no_sunday_pass')) return 'no_sunday_pass';
  if (code.includes('wrong_day')) return 'wrong-day';
  if (code.includes('not_ready')) return 'not_ready';
  if (code.includes('already_raced')) return 'already_raced';
  if (code.includes('slot_not_open')) return 'slot_not_open';
  if (code.includes('slot_closed')) return 'slot_closed';
  return null;
}

export function mapJoinErrorCode(code: string | undefined): BlockReason {
  switch (code) {
    case 'no_wallet':
      return 'no-wallet';
    case 'no_pass':
      return 'no-pass';
    case 'not_registered':
      return 'not_registered';
    case 'saturday_full':
      return 'saturday_full';
    case 'no_sunday_pass':
      return 'no_sunday_pass';
    case 'wrong_day':
      return 'wrong-day';
    case 'not_ready':
      return 'not_ready';
    case 'already_raced':
      return 'already_raced';
    case 'slot_not_open':
      return 'slot_not_open';
    case 'slot_closed':
      return 'slot_closed';
    default:
      return 'no-pass';
  }
}

export async function fetchWeekState(): Promise<WeekState | null> {
  const supabase = getSupabase();
  if (!supabase) {
    return null;
  }

  const auth = await ensureSession();
  if (!auth.session) {
    console.warn('[tournament] not authenticated — telegram-auth may have failed');
    return null;
  }

  const { data, error } = await supabase.rpc('get_my_week_state', {
    p_override: devOverride(),
  });

  if (error || !data?.authenticated) {
    console.warn('[tournament] get_my_week_state failed', error?.message);
    return null;
  }

  const passesRaw = (data.passes as Array<Record<string, string>>) ?? [];

  const sandboxRaw = data.sandbox_index;
  const sandboxIndex =
    sandboxRaw === null || sandboxRaw === undefined ? null : Number(sandboxRaw);

  return {
    authenticated: true,
    weekId: data.week_id as string,
    weekday: data.weekday as TournamentWeekday,
    sandboxIndex: Number.isFinite(sandboxIndex as number) ? (sandboxIndex as number) : null,
    walletAddress: (data.wallet_address as string | null) ?? null,
    walletLinked: Boolean(data.wallet_linked),
    passes: passesRaw.map((p) =>
      mapPass({
        id: p.id,
        grants_entry: p.grants_entry,
        won_on: p.won_on,
        week_id: p.week_id,
        nft_address: p.nft_address ?? null,
        nft_index: p.nft_index ?? null,
        mint_status: p.mint_status ?? null,
      }),
    ),
    registration: (data.registration as WeekState['registration']) ?? null,
    readyCount: Number(data.ready_count ?? 0),
    isChampion: Boolean(data.is_champion),
    championBillboardActive: Boolean(data.champion_billboard_active),
    championNftAddress: (data.champion_nft_address as string | null) ?? null,
    championMintStatus: (data.champion_mint_status as PassMintStatus | null) ?? null,
    billboardCreativeUrl: (data.billboard_creative_url as string | null) ?? null,
    billboardTransferredTo: (data.billboard_transferred_to as string | null) ?? null,
    chain: mapChain(data.chain as Record<string, unknown> | null),
  };
}

/** Wipe this user's passes / registration / ready votes for the active sandbox week. */
export async function resetDevSandboxWeek(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('supabase not configured');
  }
  const { error } = await supabase.rpc('dev_reset_my_week', {
    p_override: devOverride(),
  });
  if (error) {
    throw new Error(error.message);
  }
}

export function weekContextFromState(state: WeekState | null): ReturnType<typeof buildLocalWeekContext> {
  if (!state) {
    return buildLocalWeekContext({ passes: [] });
  }

  return buildLocalWeekContext({
    walletLinked: state.walletLinked,
    walletAddress: state.walletAddress,
    championBillboard: state.championBillboardActive,
    passes: state.passes,
    weekdayOverride: state.weekday,
    weekIdOverride: state.weekId,
  });
}

export async function linkWallet(address: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('supabase not configured');
  }
  const { error } = await supabase.rpc('link_wallet', { p_address: address });
  if (error) {
    throw new Error(error.message);
  }
}

export async function registerMondaySlot(slotId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('supabase not configured');
  }

  const auth = await ensureSession();
  if (!auth.session) {
    throw new Error('not_authenticated');
  }

  const { error } = await supabase.rpc('register_monday_slot', {
    p_slot_id: slotId,
    p_character: null,
    p_override: devOverride(),
  });
  if (error) {
    const reason = parseRpcError(error.message);
    if (reason) {
      throw new Error(reason);
    }
    throw new Error(error.message);
  }
}

export async function tapReady(): Promise<{ readyCount: number; passId: string }> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('supabase not configured');
  }
  const { data, error } = await supabase.rpc('tap_ready', { p_override: devOverride() });
  if (error) {
    const reason = parseRpcError(error.message);
    if (reason) {
      throw new Error(reason);
    }
    throw new Error(error.message);
  }
  return {
    readyCount: Number(data.ready_count),
    passId: data.pass_id as string,
  };
}

export interface BurnOutcome {
  passId: string;
  /** 'onchain' = the NFT was transferred to the burn address; 'db' = row-only burn. */
  mode: 'onchain' | 'db';
  txHash: string | null;
}

interface BurnPrepareResponse {
  mode: 'onchain' | 'db';
  passId: string;
  nftAddress?: string;
  to?: string;
  amount?: string;
  payload?: string;
  validUntil?: number;
}

/**
 * Burn-to-enter (I5). Asks the server how this pass must be burned, signs the
 * TON transfer with the connected wallet when the pass exists on-chain, then
 * has the server verify the item reached the burn address and seal the burn.
 *
 * `onStatus` receives short player-facing progress lines.
 */
export async function burnPass(
  chain: ChainService,
  passId: string,
  roomId: string,
  onStatus?: (message: string) => void,
): Promise<BurnOutcome> {
  let prepared: BurnPrepareResponse;
  try {
    prepared = await invokeFunction<BurnPrepareResponse>('pass-burn', { action: 'prepare', passId });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('function_missing:')) {
      // Edge function not deployed yet — DB-only burn keeps the loop playable.
      await confirmPassBurnRpc(roomId, null);
      return { passId, mode: 'db', txHash: null };
    }
    throw error;
  }

  let boc: string | undefined;
  if (prepared.mode === 'onchain') {
    onStatus?.('Confirm the burn in your wallet…');
    const signed = await chain.sendBurnTransaction({
      to: prepared.to!,
      amount: prepared.amount!,
      payload: prepared.payload!,
      validUntil: prepared.validUntil,
    });
    boc = signed.boc;
    onStatus?.('Waiting for TON to confirm the burn…');
  }

  // The item may take a few blocks to show at the burn address; the function
  // polls for ~45s per call, so retry a couple of times before giving up.
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await invokeFunction<{ ok: boolean; mode: 'onchain' | 'db'; txHash?: string | null }>(
        'pass-burn',
        { action: 'confirm', passId, roomId, boc, override: devOverride() },
      );
      return { passId, mode: result.mode, txHash: result.txHash ?? null };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (lastError.message !== 'burn_not_visible') {
        throw lastError;
      }
      onStatus?.('Still waiting for the chain…');
    }
  }
  throw lastError ?? new Error('burn_not_visible');
}

/** DB-only burn through the RPC (mock chain / no edge function). */
async function confirmPassBurnRpc(roomId: string, txHash: string | null): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('supabase not configured');
  }
  const { error } = await supabase.rpc('confirm_pass_burn', {
    p_room_id: roomId,
    p_tx_hash: txHash,
    p_override: devOverride(),
  });
  if (error) {
    const reason = parseRpcError(error.message);
    throw new Error(reason ?? error.message);
  }
}

/** Imports passes bought on the market into this account (verified on-chain server-side). */
export async function syncWalletPasses(): Promise<{ checked: number; imported: number }> {
  const result = await invokeFunction<{ checked: number; imported: number }>('sync-passes', {});
  return { checked: Number(result.checked ?? 0), imported: Number(result.imported ?? 0) };
}

export async function assignRoles(roomId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    return;
  }
  const { error } = await supabase.rpc('assign_roles', { p_room_id: roomId });
  if (error) {
    console.warn('[tournament] assign_roles failed', error.message);
  }
}

export async function refundPassBurn(roomId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    return;
  }
  await supabase.rpc('refund_pass_burn', { p_room_id: roomId });
}

export async function recordResults(roomId: string): Promise<RaceOutcome> {
  const supabase = getSupabase();
  if (!supabase) {
    return { outcome: 'pending' };
  }
  const { data, error } = await supabase.rpc('record_results', {
    p_room_id: roomId,
    p_override: devOverride(),
  });
  if (error) {
    console.warn('[tournament] record_results failed', error.message);
    return { outcome: 'pending' };
  }
  return {
    outcome: (data.outcome as RaceOutcome['outcome']) ?? 'eliminated',
    passId: (data.pass_id as string | null) ?? null,
    grantsEntry: (data.grants_entry as string | null) ?? null,
    sundaySlot: (data.sunday_slot as number | null) ?? null,
    alreadyRecorded: Boolean(data.already_recorded),
  };
}

export async function fetchSundayFinalists(): Promise<SundayFinalist[]> {
  const supabase = getSupabase();
  if (!supabase) {
    return [];
  }
  const { data, error } = await supabase.rpc('get_sunday_finalists', {
    p_override: devOverride(),
  });
  if (error || !Array.isArray(data)) {
    return [];
  }
  return data.map((row: Record<string, unknown>) => ({
    slot: Number(row.slot),
    userId: row.user_id as string,
    username: (row.username as string | null) ?? null,
  }));
}

export async function transferBillboardRights(toUserId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('supabase not configured');
  }
  const { error } = await supabase.rpc('transfer_billboard_rights', {
    p_to_user: toUserId,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function updateBillboardCreative(url: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('supabase not configured');
  }
  const { error } = await supabase.rpc('update_billboard_creative', {
    p_creative_url: url,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function fetchMyAssignedRole(roomId: string): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) {
    return null;
  }
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) {
    return null;
  }
  const { data, error } = await supabase
    .from('room_members')
    .select('assigned_species, character_type')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  return (data.assigned_species as string | null) ?? (data.character_type as string);
}

export function formatGrantsEntryLabel(entry: string | null | undefined): string {
  if (!entry) {
    return '';
  }
  const key = entry as TournamentWeekday;
  return LABEL_MAP[key] ?? entry;
}

export function weekdayKeyFor(day: TournamentWeekday): string {
  return KEY_MAP[day];
}

export type { WeekContext };
