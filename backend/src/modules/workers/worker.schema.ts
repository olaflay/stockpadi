import { HttpError } from "../../shared/errors/http-error.js";
import { WORKER_CAPABILITIES, type WorkerCapability } from "../../shared/contracts.generated.js";

export type WorkerAction = "create" | "reset_password" | "deactivate" | "reactivate" | "update_permissions" | "assign_branches" | "designate_manager";
export interface WorkerRequest { action: WorkerAction; userId?: string; fullName?: string; email?: string; branchId?: string | null; branchIds?: string[]; capabilities?: WorkerCapability[]; isManager?: boolean; }

export function parseWorkerRequest(input: unknown): WorkerRequest {
  if (!input || typeof input !== "object") throw new HttpError(400, "INVALID_BODY", "Request body must be an object");
  const body = input as Record<string, unknown>;
  if (!["create", "reset_password", "deactivate", "reactivate", "update_permissions", "assign_branches", "designate_manager"].includes(String(body.action))) throw new HttpError(400, "INVALID_BODY", "Invalid worker action");
  if (body.userId !== undefined && typeof body.userId !== "string") throw new HttpError(400, "INVALID_BODY", "userId must be a string");
  if (body.fullName !== undefined && typeof body.fullName !== "string") throw new HttpError(400, "INVALID_BODY", "fullName must be a string");
  if (body.email !== undefined && typeof body.email !== "string") throw new HttpError(400, "INVALID_BODY", "email must be a string");
  if (body.branchId !== undefined && body.branchId !== null && typeof body.branchId !== "string") throw new HttpError(400, "INVALID_BODY", "branchId must be a string or null");
  if (body.capabilities !== undefined && (!Array.isArray(body.capabilities) || body.capabilities.some((value) => typeof value !== "string" || !(WORKER_CAPABILITIES as readonly string[]).includes(value)))) throw new HttpError(400, "INVALID_BODY", "capabilities must contain supported permissions");
  if (body.branchIds !== undefined && (!Array.isArray(body.branchIds) || body.branchIds.some((value) => typeof value !== "string"))) throw new HttpError(400, "INVALID_BODY", "branchIds must be an array of branch ids");
  const request = { action: body.action, userId: body.userId, fullName: typeof body.fullName === "string" ? body.fullName.trim() : undefined, email: typeof body.email === "string" ? body.email.trim().toLowerCase() : undefined, branchId: body.branchId === null ? null : body.branchId, branchIds: Array.isArray(body.branchIds) ? body.branchIds as string[] : undefined, capabilities: Array.isArray(body.capabilities) ? body.capabilities as WorkerCapability[] : [], isManager: body.isManager === true } as WorkerRequest;
  if (request.action === "create" && (!request.fullName || request.fullName.length < 2 || request.fullName.length > 120 || !request.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.email))) throw new HttpError(400, "INVALID_BODY", "A valid full name and email are required");
  if (request.action !== "create" && !request.userId) throw new HttpError(400, "INVALID_BODY", "userId is required");
  return request;
}
