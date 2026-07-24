import { ensureSession } from '../net/auth';
import { getSupabase } from '../net/supabaseClient';
import type { PassChip, TournamentWeekday, WeekContext } from './types';
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
}

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
}): PassChip {
  return {
    id: row.id,
    grantsEntry: row.grants_entry as TournamentWeekday,
    wonOn: row.won_on as TournamentWeekday,
    weekId: row.week_id,
  };
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
      }),
    ),
    registration: (data.registration as WeekState['registration']) ?? null,
    readyCount: Number(data.ready_count ?? 0),
    isChampion: Boolean(data.is_champion),
    championBillboardActive: Boolean(data.champion_billboard_active),
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

export async function confirmPassBurn(roomId: string, txHash: string): Promise<void> {
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
    throw new Error(error.message);
  }
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
