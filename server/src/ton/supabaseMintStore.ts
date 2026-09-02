/**
 * MintStore over Supabase (service role). All queue logic lives in SQL RPCs
 * defined in supabase/migrations/0015_ton_nft.sql; this file only calls them.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  MintStore,
  PendingChampionMint,
  PendingPassMint,
} from './NftMinter.js';

interface PendingPassRow {
  pass_id: string;
  user_id: string;
  week_id: string;
  grants_entry: string;
  won_on: string;
  wallet_address: string;
  planned_address: string | null;
}

interface PendingChampionRow {
  week_id: string;
  user_id: string;
  wallet_address: string;
  planned_address: string | null;
}

export class SupabaseMintStore implements MintStore {
  private readonly client: SupabaseClient;

  constructor(supabaseUrl: string, serviceRoleKey: string) {
    this.client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  private async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.client.rpc(name, args);
    if (error) {
      throw new Error(`${name}: ${error.message}`);
    }
    return data as T;
  }

  async pendingPasses(limit: number): Promise<PendingPassMint[]> {
    const rows = (await this.rpc<PendingPassRow[] | null>('nft_pending_mints', { p_limit: limit })) ?? [];
    return rows.map((row) => ({
      passId: row.pass_id,
      userId: row.user_id,
      weekId: row.week_id,
      grantsEntry: row.grants_entry,
      wonOn: row.won_on,
      walletAddress: row.wallet_address,
      plannedAddress: row.planned_address,
    }));
  }

  async pendingChampions(limit: number): Promise<PendingChampionMint[]> {
    const rows =
      (await this.rpc<PendingChampionRow[] | null>('nft_pending_champions', { p_limit: limit })) ?? [];
    return rows.map((row) => ({
      weekId: row.week_id,
      userId: row.user_id,
      walletAddress: row.wallet_address,
      plannedAddress: row.planned_address,
    }));
  }

  async markPassMinting(passId: string, plannedAddress: string): Promise<boolean> {
    return Boolean(await this.rpc<boolean>('nft_mark_minting', { p_pass_id: passId, p_address: plannedAddress }));
  }

  async markPassMinted(passId: string, nftAddress: string, nftIndex: bigint, ownerWallet: string): Promise<void> {
    await this.rpc('nft_mark_minted', {
      p_pass_id: passId,
      p_address: nftAddress,
      p_index: Number(nftIndex),
      p_owner_wallet: ownerWallet,
    });
  }

  async markPassFailed(passId: string, error: string): Promise<void> {
    await this.rpc('nft_mark_failed', { p_pass_id: passId, p_error: error.slice(0, 500) });
  }

  async markChampionMinting(weekId: string, plannedAddress: string): Promise<boolean> {
    return Boolean(
      await this.rpc<boolean>('nft_mark_champion_minting', { p_week_id: weekId, p_address: plannedAddress }),
    );
  }

  async markChampionMinted(weekId: string, nftAddress: string, nftIndex: bigint): Promise<void> {
    await this.rpc('nft_mark_champion_minted', {
      p_week_id: weekId,
      p_address: nftAddress,
      p_index: Number(nftIndex),
    });
  }

  async markChampionFailed(weekId: string, error: string): Promise<void> {
    await this.rpc('nft_mark_champion_failed', { p_week_id: weekId, p_error: error.slice(0, 500) });
  }

  async expireUnlinkedPasses(): Promise<number> {
    return Number((await this.rpc<number | null>('expire_unlinked_passes', {})) ?? 0);
  }
}
