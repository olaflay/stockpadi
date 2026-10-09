import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase access is deliberately Auth-only. Business reads/writes,
 * sync, and authorization flow through the Node application API. Supabase
 * Cloud still hosts the authoritative Postgres/RLS/Auth/Realtime/Storage
 * services for this deployment.
 * See .agents/rules/hosting-and-deployment.md.
 *
 * Credentials come from environment variables managed through the Vercel
 * dashboard, never hardcoded, never committed. See .agents/rules/reusability-and-multi-client.md.
 *
 * Lazily constructed rather than built at module load: every screen renders
 * through AppLayout's SyncEngine, which touches this module on every page,
 * and this repo has real, expected states (local dev before the auth
 * screens land) where these env vars are legitimately unset. Failing only
 * when a caller actually tries to use Supabase, rather than the moment
 * anything imports this file, keeps the rest of the app usable offline
 * exactly as designed while auth is still unbuilt.
 */

let client: SupabaseClient | null | undefined;

const SUPABASE_REQUEST_TIMEOUT_MS = 15_000;

/**
 * Supabase Auth is the one browser network client outside backend-client.ts.
 * Give its REST calls the same finite lifetime so a stalled auth request does
 * not leave login, refresh, or account-context recovery waiting forever.
 */
async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const upstreamSignal = init?.signal;
  const abortFromCaller = () => controller.abort(upstreamSignal?.reason);
  if (upstreamSignal) {
    if (upstreamSignal.aborted) abortFromCaller();
    else upstreamSignal.addEventListener("abort", abortFromCaller, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), SUPABASE_REQUEST_TIMEOUT_MS);
  try {
    return await globalThis.fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    upstreamSignal?.removeEventListener("abort", abortFromCaller);
  }
}

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
    global: { fetch: fetchWithTimeout },
    realtime: {
      params: { eventsPerSecond: 5 },
    },
  });
  return client;
}
