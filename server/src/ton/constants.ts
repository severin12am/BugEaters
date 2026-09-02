/**
 * TON constants shared by the minter, the deploy scripts and the tests.
 * The Deno edge functions keep a small mirror in supabase/functions/_shared/ton.ts.
 */

/**
 * Where burned passes go: workchain 0, all-zero account hash. Nobody holds the
 * key to this account, so a transfer here is irreversible — that is the "burn".
 * Raw form `0:0000…0000`; friendly bounceable form is EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c.
 */
export const BURN_ADDRESS = `0:${'0'.repeat(64)}`;

/** TEP-62 op codes. */
export const NFT_OP = {
  transfer: 0x5fcc3d14,
  ownershipAssigned: 0x05138d91,
  excesses: 0xd53276db,
  getStaticData: 0x2fcb26a2,
  /** Collection owner → collection: deploy one item. */
  collectionMint: 1,
  /** Collection owner → collection: hand over the collection. */
  collectionChangeOwner: 3,
} as const;

/** TEP-64 content prefix byte for off-chain metadata. */
export const OFFCHAIN_CONTENT_PREFIX = 0x01;

/** TON Connect `network` ids (CHAIN.MAINNET / CHAIN.TESTNET). */
export const TON_CHAIN_ID = {
  mainnet: '-239',
  testnet: '-3',
} as const;

export type TonNetwork = keyof typeof TON_CHAIN_ID;

export function toncenterEndpoint(network: TonNetwork): string {
  return network === 'mainnet'
    ? 'https://toncenter.com/api/v2/jsonRPC'
    : 'https://testnet.toncenter.com/api/v2/jsonRPC';
}

export function tonviewerUrl(network: TonNetwork, address: string): string {
  return network === 'mainnet'
    ? `https://tonviewer.com/${address}`
    : `https://testnet.tonviewer.com/${address}`;
}
