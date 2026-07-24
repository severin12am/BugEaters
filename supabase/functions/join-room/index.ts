// Matchmaking entry point. Tournament-aware wrapper over tournament_join_room RPC.
// Deploy with: supabase functions deploy join-room

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const LOBBY_SECONDS = Number(Deno.env.get('LOBBY_SECONDS') ?? '12');

const ERROR_CODES = [
  'no_wallet',
  'no_pass',
  'not_registered',
  'saturday_full',
  'no_sunday_pass',
  'wrong_day',
  'not_ready',
  'slot_not_open',
  'slot_closed',
  'already_raced',
] as const;

function mapErrorCode(message: string): string | null {
  const lower = message.toLowerCase();
  for (const code of ERROR_CODES) {
    if (lower.includes(code)) {
      return code;
    }
  }
  return null;
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) {
    return pre;
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'missing authorization' }, 401);
  }

  let characterType: string;
  let override: string | undefined;
  try {
    const body = await req.json();
    characterType = body.characterType;
    override = body.override;
  } catch {
    return jsonResponse({ error: 'invalid body' }, 400);
  }

  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase.rpc('tournament_join_room', {
    p_character: characterType,
    p_lobby_seconds: LOBBY_SECONDS,
    p_override: override ?? null,
  });

  if (error) {
    const code = mapErrorCode(error.message);
    if (code) {
      return jsonResponse({ error: code, code }, 403);
    }
    return jsonResponse({ error: error.message }, 400);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return jsonResponse({ error: 'no room' }, 500);
  }

  return jsonResponse({
    roomId: row.room_id,
    seed: Number(row.seed),
    startsAt: row.starts_at,
    phase: row.phase,
    globalSubLane: row.global_sub_lane,
    serverNow: row.server_now,
  });
});
