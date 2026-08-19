const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Temporary compatibility transport. Domain logic must remain in backend/. */
export function serveBackendAdapter(route: string, label: string) {
  const backendUrl = Deno.env.get("BACKEND_URL")?.replace(/\/$/, "");
  return Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    if (req.method !== "POST") return new Response(JSON.stringify({ error: { code: "METHOD_NOT_ALLOWED", message: "POST only" } }), { status: 405, headers: { "Content-Type": "application/json", ...corsHeaders } });
    if (!backendUrl) return new Response(JSON.stringify({ error: { code: "BACKEND_NOT_CONFIGURED", message: `${label} backend is not configured` } }), { status: 503, headers: { "Content-Type": "application/json", ...corsHeaders } });

    console.info(JSON.stringify({ event: "compatibility_edge_function_call", function: label }));
    const upstream = await fetch(`${backendUrl}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: req.headers.get("Authorization") ?? "" },
      body: await req.text(),
    });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { "Content-Type": "application/json", "X-StockPadi-Compatibility-Adapter": label, ...corsHeaders },
    });
  });
}
