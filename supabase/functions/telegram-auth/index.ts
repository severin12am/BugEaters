// Verifies Telegram Mini App initData and returns Supabase session tokens for
// the linked user. Deploy with: supabase functions deploy telegram-auth
//
// Required secrets (Dashboard > Edge Functions > Secrets):
//   TELEGRAM_BOT_TOKEN   - the bot whose Mini App produced the initData
// Auto-provided to deployed functions:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { verifyInitData } from '../_shared/telegram.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';

function emailFor(telegramId: number): string {
  return `tg${telegramId}@bugeaters.telegram`;
}

// Deterministic password derived from the bot token so re-auth is stable
// without persisting it anywhere. Never leaves the server.
async function passwordFor(telegramId: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(BOT_TOKEN),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`pwd:${telegramId}`));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) {
    return pre;
  }

  if (!BOT_TOKEN) {
    return jsonResponse({ error: 'server not configured' }, 500);
  }

  let initData: string;
  try {
    const body = await req.json();
    initData = body.initData;
  } catch {
    return jsonResponse({ error: 'invalid body' }, 400);
  }

  const verified = await verifyInitData(initData, BOT_TOKEN);
  if (!verified) {
    return jsonResponse({ error: 'invalid initData' }, 401);
  }

  const telegramId = verified.user.id;
  const username =
    verified.user.username ?? verified.user.first_name ?? `tg${telegramId}`;
  const email = emailFor(telegramId);
  const password = await passwordFor(telegramId);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Create the user on first sight; ignore "already exists".
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { telegram_id: telegramId, username },
  });
  let userId = created.data.user?.id ?? null;

  if (created.error && !/already|registered|exists/i.test(created.error.message)) {
    return jsonResponse({ error: created.error.message }, 500);
  }

  // Sign in (anon-key client) to mint real session tokens for the browser.
  const authClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signIn = await authClient.auth.signInWithPassword({ email, password });
  if (signIn.error || !signIn.data.session) {
    return jsonResponse({ error: signIn.error?.message ?? 'sign-in failed' }, 500);
  }
  userId = signIn.data.user?.id ?? userId;

  // Keep the profile row in sync (service role bypasses RLS).
  if (userId) {
    await admin.from('profiles').upsert(
      { id: userId, telegram_id: telegramId, username },
      { onConflict: 'id' },
    );
  }

  return jsonResponse({
    access_token: signIn.data.session.access_token,
    refresh_token: signIn.data.session.refresh_token,
    user_id: userId,
    username,
  });
});
