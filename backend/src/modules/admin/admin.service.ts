import { HttpError } from "../../shared/errors/http-error.js";
import { resolveAccountContext } from "../accounts/account-context.js";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { getBusiness, getSystemStats, listBusinesses, sendBusinessApprovalEmail, setBusinessStatus, softDeleteBusiness, restoreBusiness, writePlatformAudit } from "./admin.repository.js";
import { publishPlatformBroadcast } from "../broadcasts/broadcast.service.js";
import { listPlatformBroadcasts } from "../broadcasts/broadcast.repository.js";
import type { AdminRequest } from "./admin.schema.js";

export async function executeAdminOperation(db: SupabaseClient, actor: User, request: AdminRequest) {
  const context = await resolveAccountContext(db, actor);
  if (context.accountType !== "ADMIN") throw new HttpError(403, "FORBIDDEN", "Platform admin access required");
  if (request.action === "list_businesses") return { businesses: await listBusinesses(db, actor.id) };
  if (request.action === "get_business") {
    if (!request.businessId) throw new HttpError(400, "INVALID_BODY", "businessId is required");
    return { business: await getBusiness(db, actor.id, request.businessId) };
  }
  if (request.action === "set_business_status") {
    if (!request.businessId || !request.status) throw new HttpError(400, "INVALID_BODY", "businessId and status are required");
    const existing = await getBusiness(db, actor.id, request.businessId);
    if (existing?.deleted_at) throw new HttpError(409, "BUSINESS_REMOVED", "Restore this business before changing its status.");
    const approvalTransition = request.status === "verified" && existing?.status !== "verified";
    await setBusinessStatus(db, actor.id, request.businessId, request.status);
    const welcomeEmailSent = approvalTransition
      ? await sendBusinessApprovalEmail(db, request.businessId)
      : undefined;
    return { status: "ok", welcomeEmailSent };
  }
  if (request.action === "soft_delete_business" || request.action === "restore_business") {
    if (!request.businessId) throw new HttpError(400, "INVALID_BODY", "businessId is required");
    const business = await getBusiness(db, actor.id, request.businessId);
    if (!business) throw new HttpError(404, "NOT_FOUND", "Business not found");
    if (request.action === "soft_delete_business") {
      if (business.deleted_at) throw new HttpError(409, "ALREADY_DELETED", "This business is already removed.");
      if (request.confirmation !== business.name) throw new HttpError(400, "CONFIRMATION_MISMATCH", "Enter the exact business name to confirm this action.");
      await softDeleteBusiness(db, actor.id, request.businessId);
    }
    else await restoreBusiness(db, actor.id, request.businessId);
    return { status: "ok" };
  }
  if (request.action === "list_broadcasts") {
    const broadcasts = await listPlatformBroadcasts(db);
    await writePlatformAudit(db, actor.id, "list_broadcasts", "broadcast", null, null, { count: broadcasts.length });
    return { broadcasts };
  }
  if (request.action === "get_system_stats") {
    return { stats: await getSystemStats(db, actor.id) };
  }
  const broadcastId = await publishPlatformBroadcast(db, actor, request.content ?? "");
  await writePlatformAudit(db, actor.id, "publish_broadcast", "broadcast", broadcastId, null, {
    content_preview: (request.content ?? "").slice(0, 50),
  });
  return { status: "ok", broadcastId };
}
