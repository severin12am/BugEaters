// Authoritative resolver for contested eats. The eater (caller) claims an eat;
// the referee validates membership + food-chain rules, then writes a single
// authoritative elimination that every client obeys.
// Deploy with: supabase functions deploy referee

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { canEat, type CharacterType } from '../_shared/eatingRules.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) {
    return pre;
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'missing authorization' }, 401);
  }

  let body: {
    roomId: string;
    actorId: string;
    targetId: string;
    raceTimeMs?: number;
    kind?: 'food-chain' | 'dilemma' | 'syringe';
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'invalid body' }, 400);
  }
  const { roomId, actorId, targetId, raceTimeMs, kind = 'food-chain' } = body;
  if (!roomId || !actorId || !targetId) {
    return jsonResponse({ error: 'missing fields' }, 400);
  }

  // Identify the caller; actor or victim may report an eat.
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData } = await userClient.auth.getUser();
  const callerId = userData.user?.id;
  if (!callerId || (callerId !== actorId && callerId !== targetId)) {
    return jsonResponse({ error: 'forbidden' }, 403);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Both must be members of the room; pull their characters + current state.
  const { data: members, error: memErr } = await admin
    .from('room_members')
    .select('user_id, character_type, died')
    .eq('room_id', roomId)
    .in('user_id', [actorId, targetId]);

  if (memErr || !members || members.length < 2) {
    return jsonResponse({ error: 'invalid members' }, 400);
  }

  const actor = members.find((m) => m.user_id === actorId);
  const target = members.find((m) => m.user_id === targetId);
  if (!actor || !target) {
    return jsonResponse({ error: 'invalid members' }, 400);
  }
  if (target.died) {
    return jsonResponse({ ok: true, alreadyDead: true });
  }

  // Food-chain, same-species dilemma betrayal, or a syringe ability hit.
  if (kind === 'dilemma') {
    if (actor.character_type !== target.character_type) {
      return jsonResponse({ error: 'illegal dilemma' }, 409);
    }
  } else if (kind === 'food-chain' && !canEat(actor.character_type as CharacterType, target.character_type as CharacterType)) {
    return jsonResponse({ error: 'illegal eat' }, 409);
  }

  // Write the elimination. The unique index makes this idempotent under races.
  const { error: insErr } = await admin.from('race_events').insert({
    room_id: roomId,
    type: 'elimination',
    actor_id: actorId,
    target_id: targetId,
    race_time_ms: raceTimeMs ?? null,
  });
  if (insErr && !/duplicate|unique/i.test(insErr.message)) {
    return jsonResponse({ error: insErr.message }, 500);
  }

  await admin
    .from('room_members')
    .update({ died: true })
    .eq('room_id', roomId)
    .eq('user_id', targetId);

  return jsonResponse({ ok: true });
});
