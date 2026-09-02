/**
 * Chain layer contract used by the tournament scenes.
 *
 * Two implementations:
 *   - `TonChainService`  — real TON Connect wallet + `ton_proof` link + on-chain burn (production)
 *   - `MockChainService` — deterministic fake for playtests without a wallet (dev only)
 *
 * Pick one via `getChainService()` in `./index.ts`.
 */
export interface BurnTransactionRequest {
  /** NFT item address (user-friendly form). */
  readonly to: string;
  /** Nanotons attached to the transfer message, decimal string. */
  readonly amount: string;
  /** Base64 BOC of the `transfer` body (built server-side by pass-burn/prepare). */
  readonly payload: string;
  /** Unix seconds after which the wallet refuses the request. */
  readonly validUntil?: number;
}

export interface ChainService {
  readonly kind: 'ton' | 'mock';
  /** Connects a wallet and links it to the Telegram profile. Resolves with the linked address. */
  connectWallet(): Promise<{ address: string }>;
  /** Ends the wallet session and clears the profile link. */
  disconnectWallet(): Promise<void>;
  /** The wallet address currently linked to this profile (database truth). */
  getLinkedWallet(): Promise<string | null>;
  /** Signs + broadcasts the burn transfer. Resolves with the external message BOC. */
  sendBurnTransaction(request: BurnTransactionRequest): Promise<{ boc: string }>;
}
