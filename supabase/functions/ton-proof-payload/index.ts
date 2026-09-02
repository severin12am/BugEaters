// Issues the `ton_proof` challenge payload the client hands to TON Connect
// before opening the wallet modal. Bound to the Supabase user, expires in 15 min.
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { requireUser } from '../_shared/supabase.ts';
import { issueProofPayload } from '../_shared/ton.ts';

Deno.serve(async (request) => {
  const preflight = handleOptions(request);
  if (preflight) return preflight;

  const user = await requireUser(request);
  if (!user) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }
  try {
    const { payload, expiresAt } = await issueProofPayload(user.userId);
    return jsonResponse({ payload, expiresAt });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'payload failed' }, 500);
  }
});
