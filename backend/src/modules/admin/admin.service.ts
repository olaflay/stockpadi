import { HttpError } from "../../shared/errors/http-error.js";
import { resolveAccountContext } from "../accounts/account-context.js";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { getBusiness, getSystemStats, listBusinesses, setBusinessStatus, writePlatformAudit } from "./admin.repository.js";
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
    await setBusinessStatus(db, actor.id, request.businessId, request.status);
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
