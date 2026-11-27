import { HttpError } from "../../shared/errors/http-error.js";

export type AdminAction = "list_businesses" | "get_business" | "set_business_status" | "resend_approval_email" | "soft_delete_business" | "restore_business" | "publish_broadcast" | "list_broadcasts" | "get_system_stats";
export interface AdminRequest { action: AdminAction; businessId?: string; status?: "pending" | "verified" | "suspended" | "rejected"; content?: string; confirmation?: string; }

export function parseAdminRequest(input: unknown): AdminRequest {
  if (!input || typeof input !== "object") throw new HttpError(400, "INVALID_BODY", "Request body must be an object");
  const body = input as Record<string, unknown>;
  const actions: AdminAction[] = ["list_businesses", "get_business", "set_business_status", "resend_approval_email", "soft_delete_business", "restore_business", "publish_broadcast", "list_broadcasts", "get_system_stats"];
  if (!actions.includes(body.action as AdminAction)) throw new HttpError(400, "INVALID_BODY", "Unknown admin action");
  if (body.businessId !== undefined && typeof body.businessId !== "string") throw new HttpError(400, "INVALID_BODY", "businessId must be a string");
  if (body.content !== undefined && typeof body.content !== "string") throw new HttpError(400, "INVALID_BODY", "content must be a string");
  if (body.confirmation !== undefined && typeof body.confirmation !== "string") throw new HttpError(400, "INVALID_BODY", "confirmation must be a string");
  const statuses = ["pending", "verified", "suspended", "rejected"];
  if (body.status !== undefined && !statuses.includes(String(body.status))) throw new HttpError(400, "INVALID_BODY", "Invalid business status");
  return { action: body.action as AdminAction, businessId: body.businessId as string | undefined, status: body.status as AdminRequest["status"], content: typeof body.content === "string" ? body.content.trim() : undefined, confirmation: typeof body.confirmation === "string" ? body.confirmation : undefined };
}
