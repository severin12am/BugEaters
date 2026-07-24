export interface ChainService {
  /** Simulates TON Connect. Resolves with a wallet address. */
  connectWallet(): Promise<{ address: string }>;
  disconnectWallet(): Promise<void>;
  getLinkedWallet(): Promise<string | null>;
  /** Simulates signing/sending a burn transaction. Resolves when "confirmed". */
  requestBurnSignature(passId: string): Promise<{ txHash: string }>;
}
