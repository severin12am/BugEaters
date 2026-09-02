/**
 * TON / NFT configuration for the race server (the process that mints).
 *
 * Everything is optional: with nothing set the game runs exactly as before
 * (passes stay DB-only rows). When the whole set is present the NftMinter
 * starts and pending passes / champion tokens are minted on TON.
 *
 * Env:
 *   TON_NETWORK                testnet | mainnet (default testnet)
 *   TON_API_KEY                toncenter key (optional, avoids rate limits)
 *   TON_TREASURY_MNEMONIC      24 words — collection owner + minter wallet (v4r2)
 *   NFT_COLLECTION_ADDRESS     deployed collection (scripts/ton/deploy-collection.ts)
 *   NFT_META_BASE_URL          common content prefix, e.g. https://<ref>.functions.supabase.co/nft-meta/
 *   SUPABASE_URL               project URL (already used by the results sink)
 *   SUPABASE_SERVICE_ROLE_KEY  lets the minter read pending passes + write addresses
 *   NFT_MINT_INTERVAL_MS       sweep cadence (default 30000)
 */
import { toncenterEndpoint, type TonNetwork } from './constants.js';

export interface TonConfig {
  readonly network: TonNetwork;
  readonly endpoint: string;
  readonly apiKey: string | null;
  readonly treasuryMnemonic: string | null;
  readonly collectionAddress: string | null;
  readonly metaBaseUrl: string | null;
  readonly supabaseUrl: string | null;
  readonly supabaseServiceRoleKey: string | null;
  readonly mintIntervalMs: number;
}

export function loadTonConfig(env: NodeJS.ProcessEnv = process.env): TonConfig {
  const network: TonNetwork = env.TON_NETWORK?.trim().toLowerCase() === 'mainnet' ? 'mainnet' : 'testnet';
  const interval = Number(env.NFT_MINT_INTERVAL_MS ?? '');
  return {
    network,
    endpoint: env.TON_RPC_ENDPOINT?.trim() || toncenterEndpoint(network),
    apiKey: env.TON_API_KEY?.trim() || null,
    treasuryMnemonic: env.TON_TREASURY_MNEMONIC?.trim() || null,
    collectionAddress: env.NFT_COLLECTION_ADDRESS?.trim() || null,
    metaBaseUrl: env.NFT_META_BASE_URL?.trim() || null,
    supabaseUrl: env.SUPABASE_URL?.trim() || null,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null,
    mintIntervalMs: Number.isFinite(interval) && interval >= 5_000 ? interval : 30_000,
  };
}

/** The minter needs chain write access AND database access. */
export function isMinterConfigured(config: TonConfig): boolean {
  return Boolean(
    config.treasuryMnemonic &&
      config.collectionAddress &&
      config.supabaseUrl &&
      config.supabaseServiceRoleKey,
  );
}

/** Lists what is missing so the boot log tells the operator exactly what to set. */
export function describeMinterGaps(config: TonConfig): string[] {
  const gaps: string[] = [];
  if (!config.treasuryMnemonic) gaps.push('TON_TREASURY_MNEMONIC');
  if (!config.collectionAddress) gaps.push('NFT_COLLECTION_ADDRESS');
  if (!config.supabaseUrl) gaps.push('SUPABASE_URL');
  if (!config.supabaseServiceRoleKey) gaps.push('SUPABASE_SERVICE_ROLE_KEY');
  return gaps;
}
