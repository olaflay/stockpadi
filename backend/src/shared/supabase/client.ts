import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | undefined;

/**
 * The backend uses Supabase Auth/PostgREST/RPC only; it never subscribes to
 * Realtime channels. Supabase JS still constructs its Realtime client, which
 * requires a global WebSocket on Node 20. Provide a non-connecting fallback
 * so the API remains compatible with Node 20; Node 22+ has native WebSocket.
 */
function ensureWebSocketForSupabase() {
  if (typeof globalThis.WebSocket !== "undefined") return;
  class BackendWebSocketFallback {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    readonly readyState = BackendWebSocketFallback.CLOSED;
    readonly url = "";
    readonly protocol = "";
    onopen: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onclose: ((event: CloseEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    constructor() {}
    close() {}
    send() {}
    addEventListener() {}
    removeEventListener() {}
  }
  (globalThis as typeof globalThis & { WebSocket?: unknown }).WebSocket = BackendWebSocketFallback as unknown as typeof WebSocket;
}

export function supabaseAdmin(): SupabaseClient {
  if (!cachedClient) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
    ensureWebSocketForSupabase();
    cachedClient = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  }
  return cachedClient;
}
