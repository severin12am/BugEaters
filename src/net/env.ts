/**
 * Network environment configuration.
 *
 * Multiplayer is fully optional: when the Supabase URL / anon key are missing
 * the whole game falls back to the original solo experience. This keeps local
 * development and the Telegram build working without any backend setup.
 */

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

export const SUPABASE_URL = url;
export const SUPABASE_ANON_KEY = anonKey;

/** True only when both Supabase credentials are present. */
export const isSupabaseConfigured = url.length > 0 && anonKey.length > 0;

/** Optional fixed obstacle seed (env first, then ?seed= URL param). */
export function getForcedSeed(): number | null {
  const fromEnv = import.meta.env.VITE_FORCED_SEED?.trim();
  if (fromEnv) {
    const n = Number(fromEnv);
    if (Number.isFinite(n)) {
      return n >>> 0;
    }
  }

  if (typeof window !== 'undefined') {
    const param = new URLSearchParams(window.location.search).get('seed');
    if (param) {
      const n = Number(param);
      if (Number.isFinite(n)) {
        return n >>> 0;
      }
    }
  }

  return null;
}
