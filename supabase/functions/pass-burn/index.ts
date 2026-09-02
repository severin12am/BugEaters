// Burn-to-enter (APP_MASTER_SPEC I5: pass burns in the lobby at ready-to-start).
//
//   { action: 'prepare', passId }
//     → { mode: 'onchain', nftAddress, to, amount, payload, validUntil }   (client signs via TON Connect)
//     → { mode: 'db' }                                                    (pass not on-chain yet / on-chain mode off)
//
//   { action: 'confirm', passId, roomId, boc?, txHash?, override? }
//     onchain → waits until get_nft_data(owner) == burn address, then confirm_pass_burn_verified
//     db      → confirm_pass_burn as the user
import { Address } from 'npm:@ton/core@0.63.1';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { adminClient, requireUser, userClient } from '../_shared/supabase.ts';
import {
  bocHashHex,
  buildBurnTransferBody,
  getNftData,
  isBurned,
  isInCollection,
  parseAddress,
} from '../_shared/ton.ts';

interface BurnBody {
  action?: 'prepare' | 'confirm';
  passId?: string;
  roomId?: string;
  boc?: string;
  txHash?: string;
  override?: string | null;
}

interface PassRow {
  id: string;
  user_id: string;
  status: string;
  mint_status: string;
  nft_address: string | null;
  grants_entry: string;
  week_id: string;
}

const TRANSFER_VALUE_NANO = '50000000'; // 0.05 TON
const CONFIRM_WAIT_MS = 45_000;

Deno.serve(async (request) => {
  const preflight = handleOptions(request);
  if (preflight) return preflight;

  const user = await requireUser(request);
  if (!user) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }
  let body: BurnBody;
  try {
    body = (await request.json()) as BurnBody;
  } catch {
    return jsonResponse({ error: 'invalid body' }, 400);
  }
  if (!body.passId) {
    return jsonResponse({ error: 'passId required' }, 400);
  }

  const admin = adminClient();
  const { data: pass, error: passError } = await admin
    .from('passes')
    .select('id,user_id,status,mint_status,nft_address,grants_entry,week_id')
    .eq('id', body.passId)
    .maybeSingle<PassRow>();
  if (passError || !pass) {
    return jsonResponse({ error: 'no_pass' }, 404);
  }
  if (pass.user_id !== user.userId) {
    return jsonResponse({ error: 'not_your_pass' }, 403);
  }
  if (pass.status !== 'active') {
    return jsonResponse({ error: 'pass_not_active', status: pass.status }, 409);
  }

  const { data: onchainCfg } = await admin.rpc('get_game_config_bool', {
    p_key: 'pass_required_onchain',
    p_default: false,
  });
  const onchain = Boolean(onchainCfg) && pass.mint_status === 'minted' && Boolean(pass.nft_address);

  const { data: profile } = await admin
    .from('profiles')
    .select('wallet_address')
    .eq('id', user.userId)
    .maybeSingle<{ wallet_address: string | null }>();

  if (body.action === 'prepare') {
    if (!onchain) {
      return jsonResponse({ mode: 'db', passId: pass.id });
    }
    if (!profile?.wallet_address) {
      return jsonResponse({ error: 'no_wallet' }, 403);
    }
    const responseTo = parseAddress(profile.wallet_address);
    return jsonResponse({
      mode: 'onchain',
      passId: pass.id,
      nftAddress: pass.nft_address,
      to: pass.nft_address,
      amount: TRANSFER_VALUE_NANO,
      payload: buildBurnTransferBody(responseTo).toBoc().toString('base64'),
      validUntil: Math.floor(Date.now() / 1000) + 5 * 60,
    });
  }

  if (body.action !== 'confirm') {
    return jsonResponse({ error: 'unknown action' }, 400);
  }
  if (!body.roomId) {
    return jsonResponse({ error: 'roomId required' }, 400);
  }

  if (!onchain) {
    const { data, error } = await userClient(user.authorization).rpc('confirm_pass_burn', {
      p_room_id: body.roomId,
      p_tx_hash: body.txHash ?? null,
      p_override: body.override ?? null,
    });
    if (error) {
      return jsonResponse({ error: error.message }, 409);
    }
    return jsonResponse({ ok: true, mode: 'db', ...(data ?? {}) });
  }

  // On-chain: the wallet has signed a transfer to the burn address. Wait for the
  // item to actually change owner (block time + indexer, usually < 15s).
  const item = parseAddress(pass.nft_address!);
  const deadline = Date.now() + CONFIRM_WAIT_MS;
  let burned = false;
  let inCollection = false;
  while (Date.now() < deadline) {
    const data = await getNftData(item);
    if (data) {
      inCollection = inCollection || (await isInCollection(item, data));
      if (isBurned(data)) {
        burned = true;
        break;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  if (!burned) {
    return jsonResponse({ error: 'burn_not_visible', retry: true }, 409);
  }
  if (!inCollection) {
    return jsonResponse({ error: 'fake_nft' }, 409);
  }

  let txHash = body.txHash ?? null;
  if (!txHash && body.boc) {
    try {
      txHash = bocHashHex(body.boc);
    } catch {
      txHash = null;
    }
  }

  const { data, error } = await admin.rpc('confirm_pass_burn_verified', {
    p_user: user.userId,
    p_room_id: body.roomId,
    p_pass_id: pass.id,
    p_tx_hash: `ton:${txHash ?? Address.parse(pass.nft_address!).toRawString()}`,
    p_override: body.override ?? null,
  });
  if (error) {
    return jsonResponse({ error: error.message }, 409);
  }
  return jsonResponse({ ok: true, mode: 'onchain', txHash, ...(data ?? {}) });
});
