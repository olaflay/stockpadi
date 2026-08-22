// Supabase Edge Function: sync-push. Drains one device's outbox batch.
// See .agents/skills/write-edge-function.md, .agents/rules/offline-sync-and-ledger.md,
// and docs/PRD.md Section 10.1 (sync lifecycle) and Section 12 (API contract).
//
// Deno runtime, isolated from the Next.js app's own module graph, so the
// request/response shapes below intentionally mirror (rather than import)
// src/types/sync.ts. Keep the two in sync by hand if either changes.
//
// The RLS policies in supabase/migrations/20260807054734_rls_policies.sql
// exist for direct PostgREST access; this function calls Postgres with the
// service_role key, which bypasses RLS entirely, so the authorization check
// below is not a UI nicety, it is the actual enforcement for every write
// that flows through sync-push. See "RLS still applies" in
// write-edge-function.md: the client is not a trusted boundary.

import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveAccountContext } from "../_shared/account-context.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type SyncEntityType =
  | "sale"
  | "stock_adjustment"
  | "stock_count_submission"
  | "purchase_receipt"
  | "customer"
  | "product"
  | "credit_payment"
  | "expense"
  | "supplier";

interface SyncPushBatchItem {
  client_id: string;
  type: SyncEntityType;
  payload: unknown;
  created_at_local: string;
}

interface SyncPushRequest {
  device_id: string;
  batch: SyncPushBatchItem[];
}

interface SyncItemResult {
  clientId: string;
  status: "applied" | "skipped" | "error";
  conflict?: boolean;
  error?: { code: string; message: string };
}

type Capability = "sales.create" | "inventory.adjust" | "inventory.receive" | "customers.manage" | "debts.manage" | "expenses.create";


const ENTITY_CAPABILITY: Record<SyncEntityType, Capability> = {
  sale: "sales.create",
  stock_adjustment: "inventory.adjust",
  stock_count_submission: "inventory.adjust",
  purchase_receipt: "inventory.receive",
  customer: "customers.manage",
  product: "inventory.adjust",
  credit_payment: "debts.manage",
  expense: "expenses.create",
  supplier: "inventory.receive",
};

const RPC_NAME: Record<SyncEntityType, string> = {
  sale: "sync_apply_sale",
  stock_adjustment: "sync_apply_stock_adjustment",
  stock_count_submission: "sync_apply_stock_count",
  purchase_receipt: "sync_apply_purchase_receipt",
  customer: "sync_apply_customer",
  product: "sync_apply_product",
  credit_payment: "sync_apply_credit_payment",
  expense: "sync_apply_expense",
  supplier: "sync_apply_supplier",
};

// The app calls this cross-origin (the Next.js app's own domain, not
// Supabase's), so every response needs CORS headers or the browser blocks
// it before the app ever sees a status code. Access-Control-Allow-Origin is
// "*" rather than a specific app origin because this is a multi-client
// fork per .agents/rules/reusability-and-multi-client.md — each deployment
// has its own domain, and the Authorization bearer token (not cookies) is
// what actually authenticates the caller, so a wildcard origin here does
// not widen who can act as an authenticated user.
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

function payloadBranchId(payload: unknown): string | null {
  if (typeof payload === "object" && payload !== null && "branchId" in payload) {
    const value = (payload as Record<string, unknown>).branchId;
    return typeof value === "string" ? value : null;
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return errorResponse(405, "METHOD_NOT_ALLOWED", "sync-push only accepts POST");
  }

  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return errorResponse(401, "UNAUTHENTICATED", "Missing bearer token");
  }

  // Step 1: verify the caller's identity against Supabase Auth. This is the
  // one call in this function that does NOT use the service-role client.
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser(token);

  if (authError || !user) {
    return errorResponse(401, "UNAUTHENTICATED", "Invalid or expired session");
  }

  let body: SyncPushRequest;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "INVALID_BODY", "Request body must be valid JSON");
  }

  if (!Array.isArray(body?.batch)) {
    return errorResponse(400, "INVALID_BODY", "batch must be an array");
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Step 2: resolve trusted account, tenant, membership, business, worker,
  // and branch state. This function uses service-role access below, so this
  // resolver is the authorization boundary and must not be replaced with
  // request or offline payload claims.
  const { context, error: contextError } = await resolveAccountContext(db, user);
  if (!context) {
    const code = contextError === "Business is not currently verified" ? "BUSINESS_UNAVAILABLE" : "FORBIDDEN";
    return errorResponse(403, code, contextError ?? "Unable to resolve account context");
  }

  if (context.accountType === "ADMIN" || !context.businessId) {
    return errorResponse(403, "FORBIDDEN", "Platform administrators cannot sync tenant operations");
  }

  const workerCapabilityByEntity: Record<SyncEntityType, string> = {
    sale: "POS_SELL",
    stock_adjustment: "OWNER_ONLY_STOCK_ADJUSTMENT",
    stock_count_submission: "SUBMIT_STOCK_COUNT",
    purchase_receipt: "RECEIVE_STOCK",
    customer: "MANAGE_CUSTOMERS",
    product: "MANAGE_PRODUCTS",
    credit_payment: "RECORD_REPAYMENT",
    expense: "MANAGE_EXPENSES",
    supplier: "MANAGE_SUPPLIERS",
  };
  const capabilities = new Set<Capability>(context.accountType === "BUSINESS_OWNER" ? Object.values(ENTITY_CAPABILITY) : []);
  const assignedBranchIds = context.accountType === "WORKER" ? context.branchIds : null;

  if (body.device_id) {
    await db
      .from("devices")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", body.device_id)
      .eq("user_id", user.id);
  }

  const results: SyncItemResult[] = [];

  // Step 3: process the batch in the order it was received (FIFO), per PRD
  // 10.1. Each item is independent: one item failing authorization or
  // validation must not block unrelated items later in the same batch from
  // syncing, since they may belong to a different sale entirely.
  for (const item of body.batch) {
    if (context.accountType === "WORKER" && !context.permissions.has(workerCapabilityByEntity[item.type])) {
      results.push({
        clientId: item.client_id,
        status: "error",
        error: { code: "FORBIDDEN", message: `This account cannot sync a ${item.type}` },
      });
      continue;
    }

    if (
      assignedBranchIds &&
      item.type !== "customer" &&
      item.type !== "product" &&
      item.type !== "credit_payment" &&
      item.type !== "supplier"
    ) {
      const itemBranchId = payloadBranchId(item.payload);
      if (!itemBranchId || !assignedBranchIds.has(itemBranchId)) {
        results.push({
          clientId: item.client_id,
          status: "error",
          error: { code: "FORBIDDEN", message: "Branch is outside this account's assigned branches" },
        });
        continue;
      }
    }

    const rpcName = RPC_NAME[item.type];
    const { data, error } = await db.rpc(rpcName, { payload: item.payload, actor_id: user.id });

    if (error) {
      results.push({
        clientId: item.client_id,
        status: "error",
        error: { code: "APPLY_FAILED", message: error.message },
      });
      continue;
    }

    const result = data as { status: "applied" | "skipped"; conflict?: boolean };
    results.push({
      clientId: item.client_id,
      status: result.status,
      ...(result.conflict !== undefined ? { conflict: result.conflict } : {}),
    });
  }

  return new Response(JSON.stringify({ results }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
});
