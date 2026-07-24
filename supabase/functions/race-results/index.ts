// Receives one final, signed standings payload from the authoritative race
// service and applies tournament advancement exactly once.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RACE_TOKEN_SECRET = Deno.env.get('RACE_TOKEN_SECRET')!;

Deno.serve(async (request) => {
  const preflight = handleOptions(request);
  if (preflight) return preflight;

  const signature = request.headers.get('X-Race-Signature');
  const raw = await request.text();
  if (!signature || !(await signatureMatches(raw, signature))) {
    return jsonResponse({ error: 'invalid race signature' }, 401);
  }

  let payload: {
    roomId: string;
    results: Array<{ userId: string; finished: boolean; died: boolean; finishTimeMs: number | null }>;
  };
  try {
    payload = JSON.parse(raw);
  } catch {
    return jsonResponse({ error: 'invalid result payload' }, 400);
  }
  if (!payload.roomId || !Array.isArray(payload.results)) {
    return jsonResponse({ error: 'missing results' }, 400);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.rpc('record_authoritative_results', {
    p_room_id: payload.roomId,
    p_results: payload.results.map((result) => ({
      user_id: result.userId,
      finished: result.finished,
      died: result.died,
      finish_time_ms: result.finishTimeMs,
    })),
  });
  if (error) {
    return jsonResponse({ error: error.message }, 409);
  }
  return jsonResponse({ ok: true, ...data });
});

async function signatureMatches(raw: string, supplied: string): Promise<boolean> {
  if (!RACE_TOKEN_SECRET) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(RACE_TOKEN_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw));
  const expected = base64Url(new Uint8Array(bytes));
  if (expected.length !== supplied.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i++) {
    difference |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
  }
  return difference === 0;
}

function base64Url(value: Uint8Array): string {
  let binary = '';
  value.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}
