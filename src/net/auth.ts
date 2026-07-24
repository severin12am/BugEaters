import type { Session } from '@supabase/supabase-js';
import { getSupabase } from './supabaseClient';

/**
 * Authentication for the Telegram Mini App.
 *
 * The signed `initData` string from `window.Telegram.WebApp` is sent to the
 * `telegram-auth` Edge Function, which verifies the Telegram HMAC against the
 * bot token and returns Supabase session tokens for the linked user. The
 * session is then installed into the client so all subsequent calls (channels,
 * RPC, RLS-protected tables) run as that user.
 */

let inFlight: Promise<Session | null> | null = null;

export interface AuthResult {
  session: Session | null;
  userId: string | null;
  username: string | null;
}

function getInitData(): string | null {
  const data = window.Telegram?.WebApp?.initData;
  return data && data.length > 0 ? data : null;
}

/**
 * Ensures we have a Supabase session. Verifies Telegram initData via the
 * Edge Function on first run, then reuses the persisted session.
 */
export async function ensureSession(): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) {
    return { session: null, userId: null, username: null };
  }

  const existing = await supabase.auth.getSession();
  if (existing.data.session) {
    return toResult(existing.data.session);
  }

  if (!inFlight) {
    inFlight = authenticate();
  }
  const session = await inFlight;
  inFlight = null;
  return toResult(session);
}

async function authenticate(): Promise<Session | null> {
  const supabase = getSupabase();
  if (!supabase) {
    return null;
  }

  const initData = getInitData();
  if (!initData) {
    // Outside Telegram (e.g. local browser dev) we cannot verify a real user.
    // Allow anonymous sign-in so the rest of the stack still works for testing.
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.warn('[auth] anonymous sign-in failed', error.message);
      return null;
    }
    return data.session;
  }

  const { data, error } = await supabase.functions.invoke('telegram-auth', {
    body: { initData },
  });
  if (error || !data?.access_token || !data?.refresh_token) {
    console.warn('[auth] telegram-auth failed', error?.message ?? 'no tokens');
    return null;
  }

  const { data: sessionData, error: setErr } = await supabase.auth.setSession({
    access_token: data.access_token as string,
    refresh_token: data.refresh_token as string,
  });
  if (setErr) {
    console.warn('[auth] setSession failed', setErr.message);
    return null;
  }
  return sessionData.session;
}

function toResult(session: Session | null): AuthResult {
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
  return {
    session,
    userId: session?.user.id ?? null,
    username:
      tgUser?.username ??
      tgUser?.first_name ??
      (session?.user.user_metadata?.username as string | undefined) ??
      null,
  };
}
