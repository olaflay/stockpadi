import { HttpError } from "../../shared/errors/http-error.js";
import { resolveAccountContext } from "../accounts/account-context.js";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { getBusiness, listBusinesses, setBusinessStatus } from "./admin.repository.js";
import { publishPlatformBroadcast } from "../broadcasts/broadcast.service.js";
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
    return { status: "ok" };
  }
  return { status: "ok", broadcastId: await publishPlatformBroadcast(db, actor, request.content ?? "") };
}
