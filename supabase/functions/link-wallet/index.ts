// Links a TON wallet to the Telegram/Supabase profile after verifying TON
// Connect `ton_proof` (plan §8 "Link wallet to Supabase profile"). A user can
// only link an address they proved they control.
//
// Body (from TonConnect wallet.account / connectItems.tonProof):
// {
//   address: "0:…" raw,             network: "-3" | "-239",
//   publicKey?: hex,                 stateInit?: base64,
//   proof: { timestamp, domain: { lengthBytes, value }, signature, payload }
// }
import { Address } from 'npm:@ton/core@0.63.1';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { adminClient, requireUser } from '../_shared/supabase.ts';
import {
  CHAIN_ID,
  allowedProofDomains,
  friendlyWallet,
  resolveWalletPublicKey,
  tonNetwork,
  verifyProofPayload,
  verifyTonProof,
  type TonProof,
} from '../_shared/ton.ts';

interface LinkBody {
  address?: string;
  network?: string;
  publicKey?: string;
  stateInit?: string;
  proof?: TonProof;
}

Deno.serve(async (request) => {
  const preflight = handleOptions(request);
  if (preflight) return preflight;

  const user = await requireUser(request);
  if (!user) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  let body: LinkBody;
  try {
    body = (await request.json()) as LinkBody;
  } catch {
    return jsonResponse({ error: 'invalid body' }, 400);
  }
  if (!body.address || !body.proof) {
    return jsonResponse({ error: 'address and proof are required' }, 400);
  }

  const network = tonNetwork();
  if (body.network && body.network !== CHAIN_ID[network]) {
    return jsonResponse({ error: 'wrong_network', expected: network }, 400);
  }

  let address: Address;
  try {
    address = Address.parse(body.address);
  } catch {
    return jsonResponse({ error: 'invalid address' }, 400);
  }

  if (!(await verifyProofPayload(body.proof.payload, user.userId))) {
    return jsonResponse({ error: 'payload_invalid' }, 400);
  }

  let publicKey = await resolveWalletPublicKey(address, body.proof.state_init ?? body.stateInit);
  if (!publicKey && body.publicKey) {
    // Last resort: the key TON Connect reported. Only acceptable together with a
    // state init that hashes to the address; otherwise reject.
    return jsonResponse({ error: 'public_key_unverifiable' }, 400);
  }
  if (!publicKey) {
    return jsonResponse({ error: 'public_key_unavailable' }, 400);
  }
  if (body.publicKey && body.publicKey.toLowerCase() !== Buffer.from(publicKey).toString('hex')) {
    return jsonResponse({ error: 'public_key_mismatch' }, 400);
  }

  const verdict = await verifyTonProof({
    address,
    proof: body.proof,
    publicKey,
    allowedDomains: allowedProofDomains(),
  });
  if (!verdict.ok) {
    return jsonResponse({ error: verdict.reason ?? 'proof_invalid' }, 400);
  }

  const friendly = friendlyWallet(address, network);
  const { data, error } = await adminClient().rpc('link_wallet_verified', {
    p_user: user.userId,
    p_address: friendly,
  });
  if (error) {
    const code = error.message.includes('wallet_in_use') ? 'wallet_in_use' : error.message;
    return jsonResponse({ error: code }, 409);
  }
  return jsonResponse({ address: friendly, raw: address.toRawString(), network, ...(data ?? {}) });
});
