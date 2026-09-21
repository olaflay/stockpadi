// Temporary compatibility adapter. Node /api/sync/push is the only sync
// implementation; this function contains no authorization, parsing, retry,
// or RPC dispatch logic. Remove after all deployments have switched to Node.
const BACKEND_URL = Deno.env.get("OJAPADI_BACKEND_URL") || Deno.env.get("BACKEND_URL") || Deno.env.get("STOCKPADI_BACKEND_URL");

Deno.serve(async (request) => {
  if (!BACKEND_URL) return new Response(JSON.stringify({ error: { code: "SERVER_ERROR", message: "Sync compatibility adapter is not configured." } }), { status: 503, headers: { "content-type": "application/json" } });
  const target = `${BACKEND_URL.replace(/\/$/, "")}/api/sync/push`;
  const headers = new Headers(request.headers);
  headers.delete("host");
  return fetch(target, { method: request.method, headers, body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body });
});
