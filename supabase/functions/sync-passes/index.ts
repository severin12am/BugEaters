// Secondary market import: passes bought on Getgems / received by transfer show
// up in the buyer's TON wallet but the database row still names the seller.
// This lists our collection's items in the caller's linked wallet, re-checks
// ownership on-chain, and re-homes each active pass row (`claim_pass_by_nft`).
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { adminClient, requireUser } from '../_shared/supabase.ts';
import { getNftData, isInCollection, listWalletPassNfts, parseAddress } from '../_shared/ton.ts';

Deno.serve(async (request) => {
  const preflight = handleOptions(request);
  if (preflight) return preflight;

  const user = await requireUser(request);
  if (!user) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }
  const admin = adminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('wallet_address')
    .eq('id', user.userId)
    .maybeSingle<{ wallet_address: string | null }>();
  if (!profile?.wallet_address) {
    return jsonResponse({ error: 'no_wallet' }, 403);
  }

  const wallet = parseAddress(profile.wallet_address);
  let items: Array<{ address: string }>;
  try {
    items = await listWalletPassNfts(wallet);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'indexer failed' }, 502);
  }

  const imported: string[] = [];
  const skipped: Array<{ address: string; reason: string }> = [];
  for (const item of items) {
    const address = parseAddress(item.address);
    const data = await getNftData(address);
    if (!data?.initialized || !data.owner || !data.owner.equals(wallet)) {
      skipped.push({ address: item.address, reason: 'not_owner_onchain' });
      continue;
    }
    if (!(await isInCollection(address, data))) {
      skipped.push({ address: item.address, reason: 'fake_nft' });
      continue;
    }
    const { data: claim, error } = await admin.rpc('claim_pass_by_nft', {
      p_user: user.userId,
      p_nft_address: address.toString(),
    });
    if (error) {
      skipped.push({ address: item.address, reason: error.message });
    } else if (claim?.claimed) {
      imported.push(claim.pass_id as string);
    } else {
      skipped.push({ address: item.address, reason: (claim?.reason as string) ?? 'not_claimed' });
    }
  }
  return jsonResponse({ checked: items.length, imported: imported.length, passIds: imported, skipped });
});
