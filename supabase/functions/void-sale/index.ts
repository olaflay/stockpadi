// Supabase Edge Function: void-sale. Refunds/voids require an online
// connection by deliberate, locked decision — see .agents/rules/
// payment-and-pci-scope.md item 4 and src/features/pos/README.md ("void
// (online only)"). Unlike every other write in this app, this does NOT go
// through the local outbox: the client calls this function directly and only
// updates its own IndexedDB after the server confirms success, so a device
// can never "optimistically" void a sale it turns out it wasn't allowed to.
//
// Reverses the sale's stock impact with a new, paired stock_movements row
// (source 'sale_void') rather than deleting or editing the original
// movements — ledger is append-only, per .agents/rules/offline-sync-and-ledger.md.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type AppRole = "owner" | "manager" | "cashier" | "inventory_staff" | "accountant" | "admin";
// Matches PERMISSION_MATRIX.void_sale in src/types/permissions.ts.
const VOID_ROLES: AppRole[] = ["owner", "manager", "admin"];

interface RequestBody {
  saleId?: string;
  reason?: string;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function errorResponse(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return errorResponse(405, "METHOD_NOT_ALLOWED", "void-sale only accepts POST");
  }

  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) return errorResponse(401, "UNAUTHENTICATED", "Missing bearer token");

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const {
    data: { user: actingAuthUser },
    error: authError,
  } = await authClient.auth.getUser(token);
  if (authError || !actingAuthUser) return errorResponse(401, "UNAUTHENTICATED", "Invalid or expired session");

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "INVALID_BODY", "Request body must be valid JSON");
  }
  if (!body.saleId) return errorResponse(400, "INVALID_BODY", "saleId is required");

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: actingProfile, error: actingProfileError } = await db
    .from("users")
    .select("id, role, is_active, business_id")
    .eq("id", actingAuthUser.id)
    .maybeSingle();
  if (actingProfileError || !actingProfile || !actingProfile.is_active) {
    return errorResponse(403, "FORBIDDEN", "No active staff account for this session");
  }
  const actingRole = actingProfile.role as AppRole;

  if (!VOID_ROLES.includes(actingRole)) {
    return errorResponse(403, "FORBIDDEN", `Role ${actingRole} may not void a sale`);
  }

  // Locks the sale row and does the read-check-write-write-write atomically
  // in one transaction, so two concurrent void requests for the same sale
  // serialize instead of racing past the already-voided check (see
  // 20260810122000_atomic_void_sale.sql for why this used to be unsafe).
  const { data: result, error: voidError } = await db.rpc("void_sale", {
    p_sale_id: body.saleId,
    p_actor_id: actingAuthUser.id,
    p_business_id: actingProfile.business_id,
    p_reason: body.reason ?? null,
  });

  if (voidError) {
    if (voidError.message.includes("Sale not found")) {
      return errorResponse(404, "NOT_FOUND", "Sale not found");
    }
    if (voidError.message.includes("already voided")) {
      return errorResponse(409, "ALREADY_VOIDED", "This sale was already voided");
    }
    return errorResponse(500, "VOID_FAILED", voidError.message);
  }

  return okResponse({
    status: "ok",
    reversedMovements: result?.reversedMovements ?? 0,
    reversedCreditMovements: result?.reversedCreditMovements ?? 0,
  });
});
