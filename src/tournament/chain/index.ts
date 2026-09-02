/**
 * Chain layer factory. Real TON when `VITE_TONCONNECT_MANIFEST_URL` is set,
 * otherwise the playtest mock (which the server only accepts in dev_mode).
 */
import { isTonConnectEnabled } from '../../ton/env';
import type { ChainService } from './ChainService';
import { MockChainService } from './MockChainService';
import { TonChainService } from './TonChainService';

let instance: ChainService | null = null;

export function getChainService(): ChainService {
  if (!instance) {
    instance = isTonConnectEnabled ? new TonChainService() : new MockChainService();
  }
  return instance;
}

export type { BurnTransactionRequest, ChainService } from './ChainService';
