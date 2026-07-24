import { ensureSession } from '../../net/auth';
import { getSupabase } from '../../net/supabaseClient';
import { linkWallet } from '../tournamentApi';
import type { ChainService } from './ChainService';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashUserId(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36).toUpperCase().padStart(6, '0').slice(0, 6);
}

function buildAddress(userId: string): string {
  return `UQ${hashUserId(userId)}7xMockChainAddr`;
}

function randomHex(bytes: number): string {
  const chars = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < bytes * 2; i++) {
    out += chars[Math.floor(Math.random() * 16)];
  }
  return out;
}

/** Stand-in chain layer for playtests — swap for real TON Connect later. */
export class MockChainService implements ChainService {
  async connectWallet(): Promise<{ address: string }> {
    const auth = await ensureSession();
    if (!auth.userId) {
      throw new Error('not authenticated');
    }

    await delay(800 + Math.floor(Math.random() * 700));

    const address = buildAddress(auth.userId);
    await linkWallet(address);
    return { address };
  }

  async disconnectWallet(): Promise<void> {
    const supabase = getSupabase();
    if (!supabase) {
      return;
    }
    await supabase.from('profiles').update({ wallet_address: null, wallet_linked_at: null }).eq('id', (await ensureSession()).userId ?? '');
  }

  async getLinkedWallet(): Promise<string | null> {
    const supabase = getSupabase();
    if (!supabase) {
      return null;
    }
    const auth = await ensureSession();
    if (!auth.userId) {
      return null;
    }
    const { data } = await supabase.from('profiles').select('wallet_address').eq('id', auth.userId).maybeSingle();
    return (data?.wallet_address as string | null) ?? null;
  }

  async requestBurnSignature(passId: string): Promise<{ txHash: string }> {
    void passId;
    await delay(1000 + Math.floor(Math.random() * 1000));
    return { txHash: `0x${randomHex(32)}` };
  }
}

let instance: ChainService | null = null;

export function getChainService(): ChainService {
  if (!instance) {
    instance = new MockChainService();
  }
  return instance;
}
