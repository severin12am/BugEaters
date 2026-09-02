// Supabase client helpers shared by the tournament / TON edge functions.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/** Client acting as the caller (RLS + auth.uid() apply). */
export function userClient(authorization: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Service-role client (bypasses RLS; can call service-only RPCs). */
export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Resolves the authenticated user id from the request, or null. */
export async function requireUser(request: Request): Promise<{ userId: string; authorization: string } | null> {
  const authorization = request.headers.get('Authorization');
  if (!authorization) {
    return null;
  }
  const { data } = await userClient(authorization).auth.getUser();
  const userId = data.user?.id;
  return userId ? { userId, authorization } : null;
}
