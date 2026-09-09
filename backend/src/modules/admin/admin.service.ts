import { HttpError } from "../../shared/errors/http-error.js";
import { resolveAccountContext } from "../accounts/account-context.js";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { getBusiness, getSystemStats, listBusinesses, setBusinessStatus } from "./admin.repository.js";
import { issueVerificationCode } from "../auth/email-verification.service.js";
import { publishPlatformBroadcast } from "../broadcasts/broadcast.service.js";
import { listPlatformBroadcasts } from "../broadcasts/broadcast.repository.js";
import type { AdminRequest } from "./admin.schema.js";

export async function executeAdminOperation(db: SupabaseClient, actor: User, request: AdminRequest) {
  const context = await resolveAccountContext(db, actor);
  if (context.accountType !== "ADMIN") throw new HttpError(403, "FORBIDDEN", "Platform admin access required");
  if (request.action === "list_businesses") return { businesses: await listBusinesses(db) };
  if (request.action === "get_business") {
    if (!request.businessId) throw new HttpError(400, "INVALID_BODY", "businessId is required");
    return { business: await getBusiness(db, request.businessId) };
  }
  if (request.action === "set_business_status") {
    if (!request.businessId || !request.status) throw new HttpError(400, "INVALID_BODY", "businessId and status are required");
    await setBusinessStatus(db, actor.id, request.businessId, request.status);
    // Approval is the single moment the owner's verification code email may
    // leave. Dispatch it here (best-effort) so the email only ever goes out
    // AFTER the admin verifies the account. Registers today never send email.
    if (request.status === "verified") {
      await dispatchVerificationEmailForApprovedBusiness(db, request.businessId);
    }
    return { status: "ok" };
  }
  if (request.action === "list_broadcasts") {
    return { broadcasts: await listPlatformBroadcasts(db) };
  }
  if (request.action === "get_system_stats") {
    return { stats: await getSystemStats(db) };
  }
  return { status: "ok", broadcastId: await publishPlatformBroadcast(db, actor, request.content ?? "") };
}

async function dispatchVerificationEmailForApprovedBusiness(db: SupabaseClient, businessId: string) {
  try {
    const { data: owner, error } = await db
      .from("users")
      .select("id, full_name, email_verified")
      .eq("business_id", businessId)
      .eq("account_type", "BUSINESS_OWNER")
      .maybeSingle();
    if (error || !owner) return;
    if (owner.email_verified) return; // already verified — nothing to send
    // Email lives in auth.users, not the public users table, so fetch it via
    // the admin auth API for the owner's id.
    const { data: authUser } = await db.auth.admin.getUserById(owner.id);
    const email = authUser?.user?.email;
    if (!email) return;
    await issueVerificationCode(db, owner.id, owner.full_name ?? "Owner", email, { suppressEmailError: true });
  } catch (error) {
    console.error("Approval verification email dispatch failed (approval itself succeeded)", error instanceof Error ? error.message : "unknown error");
  }
}
