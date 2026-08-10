// Supabase Edge Function: manage-staff. Every staff-admin action (create,
// role change, PIN reset/self-change, deactivate) goes through here rather
// than plain PostgREST, for two reasons: creating an auth.users row needs
// the Admin API (service_role), which PostgREST/anon key cannot do; and per
// .agents/skills/write-edge-function.md, "the client is not a trusted
// boundary" — every action re-verifies the caller's role server-side even
// though this function itself uses service_role (bypasses RLS).
//
// PIN values are never sent to this function in the clear. The client
// computes the salted PBKDF2 hash locally (src/lib/pin-hash.ts) and sends
// only the resulting "<saltHex>:<hashHex>" string — the same value it
// caches in Dexie for offline validation, so the server and this device
// always agree on the same hash.
//
// See docs/RESEARCH-AND-PLAN.md Section 4.2 and Phase 2 item 15,
// .agents/rules/database-and-rls.md (audit logging), PRD Section 10.3.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// "Up to 3 staff on top of the owner," per docs/RESEARCH-AND-PLAN.md Section
// 4.2 — hard-coded, confirmed with the product owner rather than left
// configurable.
const STAFF_CAP = 3;

type AppRole = "owner" | "manager" | "cashier" | "inventory_staff" | "accountant" | "admin";
const MANAGE_ROLES: AppRole[] = ["owner", "admin"];

type Action = "create" | "change_role" | "reset_pin" | "set_own_pin" | "deactivate";

interface RequestBody {
  action: Action;
  userId?: string;
  fullName?: string;
  phone?: string | null;
  email?: string;
  initialPassword?: string;
  role?: AppRole;
  branchId?: string | null;
  pinHash?: string;
}

// See the matching comment in supabase/functions/sync-push/index.ts — same
// cross-origin reasoning applies here.
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

async function writeAuditLog(
  db: ReturnType<typeof createClient>,
  actorUserId: string,
  businessId: string,
  action: string,
  entityId: string | null,
  beforeState: unknown,
  afterState: unknown
) {
  await db.from("audit_logs").insert({
    business_id: businessId,
    actor_user_id: actorUserId,
    action,
    entity_type: "users",
    entity_id: entityId,
    before_state: beforeState,
    after_state: afterState,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return errorResponse(405, "METHOD_NOT_ALLOWED", "manage-staff only accepts POST");
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

  // set_own_pin is the one action any active staff member may take on
  // themselves; everything else is owner/admin managing someone else.
  if (body.action === "set_own_pin") {
    if (!body.pinHash) return errorResponse(400, "INVALID_BODY", "pinHash is required");
    const { error } = await db.from("users").update({ pin_hash: body.pinHash }).eq("id", actingAuthUser.id);
    if (error) return errorResponse(500, "UPDATE_FAILED", error.message);
    await writeAuditLog(db, actingAuthUser.id, actingProfile.business_id, "pin_reset", actingAuthUser.id, null, { self: true });
    return okResponse({ status: "ok" });
  }

  if (!MANAGE_ROLES.includes(actingRole)) {
    return errorResponse(403, "FORBIDDEN", `Role ${actingRole} may not manage staff`);
  }

  if (body.action === "create") {
    // Note: `users` has no phone column today (only `customers` does); phone
    // collected on the Add Staff form is not yet persisted server-side.
    const { fullName, email, initialPassword, role, branchId, pinHash } = body;
    if (!fullName || !email || !initialPassword || !role || !pinHash) {
      return errorResponse(400, "INVALID_BODY", "fullName, email, initialPassword, role and pinHash are required");
    }

    // super_admin is a platform-level role that sits outside any tenant's
    // business scope entirely — nobody may grant it through tenant staff
    // management, regardless of the actor's own role. The only legitimate
    // path is the super_admin-only RLS policy or the signup trigger. body.role
    // is untyped at runtime (RequestBody is a compile-time assertion only,
    // req.json() accepts any string), so this must be checked explicitly
    // rather than relying on the AppRole type to rule it out.
    if ((role as string) === "super_admin") {
      return errorResponse(403, "FORBIDDEN", "super_admin cannot be granted through staff management");
    }

    // Only an Owner may grant owner/admin-level access — "Owner is the final
    // boss," per docs/RESEARCH-AND-PLAN.md 4.2. Without this, an Admin could
    // mint a brand-new Owner (or Admin) account outright.
    if ((role === "owner" || role === "admin") && actingRole !== "owner") {
      return errorResponse(403, "FORBIDDEN", "Only the Owner can grant owner or admin access");
    }

    const { count } = await db
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("business_id", actingProfile.business_id)
      .neq("role", "owner")
      .eq("is_active", true);
    if ((count ?? 0) >= STAFF_CAP) {
      return errorResponse(409, "STAFF_CAP_REACHED", `Only ${STAFF_CAP} staff are allowed on top of the owner`);
    }

    const { data: created, error: createError } = await db.auth.admin.createUser({
      email,
      password: initialPassword,
      email_confirm: true,
    });
    if (createError || !created.user) {
      return errorResponse(500, "CREATE_FAILED", createError?.message ?? "Could not create the account");
    }

    const { error: insertError } = await db.from("users").insert({
      id: created.user.id,
      business_id: actingProfile.business_id,
      full_name: fullName,
      role,
      pin_hash: pinHash,
      is_active: true,
    });
    if (insertError) {
      await db.auth.admin.deleteUser(created.user.id);
      return errorResponse(500, "INSERT_FAILED", insertError.message);
    }

    if (branchId) {
      await db.from("user_branches").insert({ user_id: created.user.id, branch_id: branchId, business_id: actingProfile.business_id });
    }

    await writeAuditLog(db, actingAuthUser.id, actingProfile.business_id, "staff_created", created.user.id, null, { fullName, role });
    return okResponse({ status: "ok", userId: created.user.id });
  }

  // Every remaining action targets an existing staff member.
  if (!body.userId) return errorResponse(400, "INVALID_BODY", "userId is required");

  const { data: target, error: targetError } = await db
    .from("users")
    .select("id, role, is_active")
    .eq("id", body.userId)
    .eq("business_id", actingProfile.business_id)
    .maybeSingle();
  if (targetError || !target) return errorResponse(404, "NOT_FOUND", "Staff member not found");

  // Only an Owner may change or deactivate another Owner. Admin manages
  // everyone else. "Owner is the final boss," per RESEARCH-AND-PLAN.md 4.2.
  if (target.role === "owner" && actingRole !== "owner") {
    return errorResponse(403, "FORBIDDEN", "Only the Owner can modify the Owner account");
  }

  if (body.action === "change_role") {
    if (!body.role) return errorResponse(400, "INVALID_BODY", "role is required");
    // Same rule as "create" — see the comment there. Blocks granting
    // super_admin through this function entirely, and blocks a non-Owner
    // from escalating themselves or anyone else to owner/admin.
    if ((body.role as string) === "super_admin") {
      return errorResponse(403, "FORBIDDEN", "super_admin cannot be granted through staff management");
    }
    if ((body.role === "owner" || body.role === "admin") && actingRole !== "owner") {
      return errorResponse(403, "FORBIDDEN", "Only the Owner can grant owner or admin access");
    }
    const { error } = await db.from("users").update({ role: body.role }).eq("id", body.userId);
    if (error) return errorResponse(500, "UPDATE_FAILED", error.message);
    await writeAuditLog(db, actingAuthUser.id, actingProfile.business_id, "role_change", body.userId, { role: target.role }, { role: body.role });
    return okResponse({ status: "ok" });
  }

  if (body.action === "reset_pin") {
    if (!body.pinHash) return errorResponse(400, "INVALID_BODY", "pinHash is required");
    const { error } = await db.from("users").update({ pin_hash: body.pinHash }).eq("id", body.userId);
    if (error) return errorResponse(500, "UPDATE_FAILED", error.message);
    await writeAuditLog(db, actingAuthUser.id, actingProfile.business_id, "pin_reset", body.userId, null, { resetBy: actingAuthUser.id });
    return okResponse({ status: "ok" });
  }

  if (body.action === "deactivate") {
    const { error } = await db.from("users").update({ is_active: false }).eq("id", body.userId);
    if (error) return errorResponse(500, "UPDATE_FAILED", error.message);
    await writeAuditLog(db, actingAuthUser.id, actingProfile.business_id, "staff_deactivated", body.userId, { isActive: true }, { isActive: false });
    return okResponse({ status: "ok" });
  }

  return errorResponse(400, "INVALID_BODY", `Unknown action: ${body.action}`);
});
