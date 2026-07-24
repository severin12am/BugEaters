// Issues a short-lived, signed admission ticket for the authoritative race
// server. The browser never receives the race-server signing secret.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RACE_TOKEN_SECRET = Deno.env.get('RACE_TOKEN_SECRET')!;

Deno.serve(async (request) => {
  const preflight = handleOptions(request);
  if (preflight) {
    return preflight;
  }
  const authorization = request.headers.get('Authorization');
  if (!authorization) {
    return jsonResponse({ error: 'missing authorization' }, 401);
  }

  let roomId: string;
  try {
    ({ roomId } = await request.json());
  } catch {
    return jsonResponse({ error: 'invalid request' }, 400);
  }
  if (!roomId) {
    return jsonResponse({ error: 'missing roomId' }, 400);
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData } = await userClient.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: member, error: memberError } = await admin
    .from('room_members')
    .select('character_type, global_sub_lane')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .maybeSingle();
  const { data: room, error: roomError } = await admin
    .from('rooms')
    .select('seed, starts_at, max_players, phase')
    .eq('id', roomId)
    .maybeSingle();

  if (memberError || roomError || !member || !room || !room.starts_at) {
    return jsonResponse({ error: 'not an active room member' }, 403);
  }
  if (!['countdown', 'racing'].includes(room.phase)) {
    return jsonResponse({ error: 'room not available' }, 409);
  }

  const claims = {
    roomId,
    userId,
    role: member.character_type,
    globalSubLane: member.global_sub_lane,
    startsAtMs: new Date(room.starts_at).getTime(),
    seed: Number(room.seed),
    maxPlayers: Number(room.max_players),
    exp: Date.now() + 90_000,
  };
  const payload = base64Url(JSON.stringify(claims));
  const signature = await hmac(payload);
  return jsonResponse({ token: `${payload}.${signature}`, expiresAtMs: claims.exp });
});

async function hmac(payload: string): Promise<string> {
  if (!RACE_TOKEN_SECRET) {
    throw new Error('RACE_TOKEN_SECRET is not configured');
  }
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(RACE_TOKEN_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return base64UrlBytes(new Uint8Array(signature));
}

function base64Url(value: string): string {
  return base64UrlBytes(new TextEncoder().encode(value));
}

function base64UrlBytes(value: Uint8Array): string {
  let binary = '';
  value.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}
