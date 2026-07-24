import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from './env';

let client: SupabaseClient | null = null;

/**
 * Lazily-created singleton Supabase client. Returns null when the project is
 * not configured (solo mode), so callers must null-check.
 */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) {
    return null;
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Telegram Mini Apps load in a webview; the session lives in localStorage.
        storageKey: 'bugeaters-auth',
      },
      realtime: {
        params: {
          // Cap broadcast/presence event rate; player state is ~10-12Hz.
          eventsPerSecond: 16,
        },
      },
    });
  }
  return client;
}
