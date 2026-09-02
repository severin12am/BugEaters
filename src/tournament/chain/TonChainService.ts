/**
 * Real TON chain layer: TON Connect wallet, `ton_proof`-verified profile link,
 * on-chain pass burn. Server-side verification lives in
 * supabase/functions/{ton-proof-payload,link-wallet,pass-burn}.
 */
import { ensureSession } from '../../net/auth';
import { getSupabase } from '../../net/supabaseClient';
import { tonConnectService } from '../../ton/TonConnectService';
import { invokeFunction } from '../tournamentApi';
import type { BurnTransactionRequest, ChainService } from './ChainService';

export class TonChainService implements ChainService {
  readonly kind = 'ton' as const;

  async connectWallet(): Promise<{ address: string }> {
    const auth = await ensureSession();
    if (!auth.session) {
      throw new Error('not_authenticated');
    }
    const challenge = await invokeFunction<{ payload: string }>('ton-proof-payload', {});
    const wallet = await tonConnectService.connectWithProof(challenge.payload);
    const linked = await invokeFunction<{ address: string }>('link-wallet', {
      address: wallet.rawAddress,
      network: wallet.chain,
      publicKey: wallet.publicKey ?? undefined,
      stateInit: wallet.walletStateInit,
      proof: { ...wallet.proof, state_init: wallet.walletStateInit },
    });
    return { address: linked.address };
  }

  async disconnectWallet(): Promise<void> {
    await tonConnectService.disconnect();
    const supabase = getSupabase();
    if (!supabase) {
      return;
    }
    const { error } = await supabase.rpc('unlink_wallet');
    if (error) {
      throw new Error(error.message);
    }
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

  sendBurnTransaction(request: BurnTransactionRequest): Promise<{ boc: string }> {
    return tonConnectService.sendTransaction({
      to: request.to,
      amount: request.amount,
      payload: request.payload,
      validUntil: request.validUntil,
    });
  }
}
