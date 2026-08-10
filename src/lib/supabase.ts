import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Points at the self-hosted Supabase instance (Postgres, Auth, Realtime,
 * Storage, Edge Functions) on the deployment VPS via Coolify.
 * Never Supabase Cloud, never Vercel. See .agents/rules/hosting-and-deployment.md.
 *
 * Credentials come from environment variables managed through Coolify,
 * never hardcoded, never committed. See .agents/rules/reusability-and-multi-client.md.
 *
 * Lazily constructed rather than built at module load: every screen renders
 * through AppLayout's SyncEngine, which touches this module on every page,
 * and this repo has real, expected states (local dev before the VPS/auth
 * screens land) where these env vars are legitimately unset. Failing only
 * when a caller actually tries to use Supabase, rather than the moment
 * anything imports this file, keeps the rest of the app usable offline
 * exactly as designed while auth is still unbuilt.
 */

let client: SupabaseClient | null | undefined;

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    client = null;
    return client;
  }

  client = createClient(supabaseUrl, supabaseAnonKey, {
    realtime: {
      params: { eventsPerSecond: 5 },
    },
  });
  return client;
}
