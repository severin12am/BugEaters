/**
 * TON integration for the race server: composition helper used by the
 * ServerContext. Returns null when the minter is not configured so the game
 * keeps running DB-only (passes stay rows until an operator sets the secrets).
 */
import { Address } from '@ton/core';
import { describeMinterGaps, isMinterConfigured, loadTonConfig, type TonConfig } from './config.js';
import { NftMinter } from './NftMinter.js';
import { SupabaseMintStore } from './supabaseMintStore.js';
import { createTonClient } from './tonClient.js';
import { openTreasury } from './treasury.js';

export * from './config.js';
export * from './constants.js';
export * from './nftCollection.js';
export * from './NftMinter.js';
export * from './tonClient.js';
export * from './treasury.js';

export interface TonRuntime {
  readonly config: TonConfig;
  readonly minter: NftMinter;
}

/** Builds the minter from env, or explains why it stays off. */
export async function createTonRuntime(env: NodeJS.ProcessEnv = process.env): Promise<TonRuntime | null> {
  const config = loadTonConfig(env);
  if (!isMinterConfigured(config)) {
    console.warn(
      `[ton] NFT minter OFF — missing ${describeMinterGaps(config).join(', ')}. ` +
        'Passes stay database rows until these are set (see contracts/README.md).',
    );
    return null;
  }
  const client = createTonClient(config);
  const treasury = await openTreasury(client, config.treasuryMnemonic!);
  const minter = new NftMinter({
    client,
    treasury,
    collection: Address.parse(config.collectionAddress!),
    store: new SupabaseMintStore(config.supabaseUrl!, config.supabaseServiceRoleKey!),
  });
  console.info(
    `[ton] NFT minter ON (${config.network}) — treasury ${treasury.address.toString()} ` +
      `collection ${config.collectionAddress}`,
  );
  return { config, minter };
}
