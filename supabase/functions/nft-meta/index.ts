// TEP-64 off-chain metadata for the pass collection. Public GET, no JWT
// (deploy with verify_jwt = false — see supabase/config.toml).
//
//   /nft-meta/collection.json
//   /nft-meta/pass/<pass uuid>.json
//   /nft-meta/champion/<week_id>.json
//
// Display data only — the game never authorizes from this JSON.
import { corsHeaders } from '../_shared/cors.ts';
import { adminClient } from '../_shared/supabase.ts';

const APP_URL = (Deno.env.get('PUBLIC_APP_URL') ?? 'https://bugeaters-cey.pages.dev').replace(/\/$/u, '');
const IMAGE_BASE = (Deno.env.get('NFT_IMAGE_BASE_URL') ?? `${APP_URL}/assets/nft`).replace(/\/$/u, '');

const DAY_LABEL: Record<string, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      ...corsHeaders,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Content-Type': 'application/json',
      'Cache-Control': status === 200 ? 'public, max-age=60' : 'no-store',
    },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  const path = new URL(request.url).pathname.replace(/^.*\/nft-meta\/?/u, '');

  if (path === '' || path === 'collection.json') {
    return json({
      name: 'BugEaters Tournament Passes',
      description:
        'Weekly BugEaters tournament passes. Win a race, receive next day’s pass; burn it in the lobby to race. One pass = one race. Sunday champion tokens live here too.',
      image: `${IMAGE_BASE}/collection.png`,
      external_url: APP_URL,
      social_links: [APP_URL],
    });
  }

  const admin = adminClient();

  const passMatch = /^pass\/([0-9a-f-]{36})\.json$/iu.exec(path);
  if (passMatch) {
    const { data: pass } = await admin
      .from('passes')
      .select('id,week_id,grants_entry,won_on,status,nft_index')
      .eq('id', passMatch[1])
      .maybeSingle<{ id: string; week_id: string; grants_entry: string; won_on: string; status: string; nft_index: number | null }>();
    if (!pass) {
      return json({ error: 'not found' }, 404);
    }
    const day = DAY_LABEL[pass.grants_entry] ?? pass.grants_entry;
    return json({
      name: `BugEaters ${day} Pass — week ${pass.week_id}`,
      description: `Entry to the ${day} BugEaters race of tournament week ${pass.week_id}. Earned on ${DAY_LABEL[pass.won_on] ?? pass.won_on}. Burn in the lobby to race; one pass = one race.${pass.status === 'burned' ? ' (Already burned.)' : ''}`,
      image: `${IMAGE_BASE}/pass-${pass.grants_entry}.png`,
      external_url: APP_URL,
      attributes: [
        { trait_type: 'game', value: 'bugeaters' },
        { trait_type: 'kind', value: 'pass' },
        { trait_type: 'week_id', value: pass.week_id },
        { trait_type: 'grants_entry', value: pass.grants_entry },
        { trait_type: 'won_on', value: pass.won_on },
        { trait_type: 'status', value: pass.status },
      ],
    });
  }

  const champMatch = /^champion\/(\d{4}-\d{2}-\d{2})\.json$/u.exec(path);
  if (champMatch) {
    const { data: week } = await admin
      .from('tournament_weeks')
      .select('week_id,champion_user_id')
      .eq('week_id', champMatch[1])
      .maybeSingle<{ week_id: string; champion_user_id: string | null }>();
    if (!week?.champion_user_id) {
      return json({ error: 'not found' }, 404);
    }
    const { data: profile } = await admin
      .from('profiles')
      .select('username')
      .eq('id', week.champion_user_id)
      .maybeSingle<{ username: string | null }>();
    return json({
      name: `BugEaters World Champion — week ${week.week_id}`,
      description: `Sunday finale winner of BugEaters tournament week ${week.week_id}${profile?.username ? ` — ${profile.username}` : ''}. Carries next Monday's in-race billboard rights.`,
      image: `${IMAGE_BASE}/champion.png`,
      external_url: APP_URL,
      attributes: [
        { trait_type: 'game', value: 'bugeaters' },
        { trait_type: 'kind', value: 'champion' },
        { trait_type: 'week_id', value: week.week_id },
      ],
    });
  }

  return json({ error: 'not found' }, 404);
});
