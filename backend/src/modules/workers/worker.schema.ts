import { HttpError } from "../../shared/errors/http-error.js";

export type WorkerAction = "create" | "reset_password" | "deactivate";
export interface WorkerRequest { action: WorkerAction; userId?: string; fullName?: string; email?: string; branchId?: string | null; }

export function parseWorkerRequest(input: unknown): WorkerRequest {
  if (!input || typeof input !== "object") throw new HttpError(400, "INVALID_BODY", "Request body must be an object");
  const body = input as Record<string, unknown>;
  if (body.action !== "create" && body.action !== "reset_password" && body.action !== "deactivate") throw new HttpError(400, "INVALID_BODY", "Invalid worker action");
  if (body.userId !== undefined && typeof body.userId !== "string") throw new HttpError(400, "INVALID_BODY", "userId must be a string");
  if (body.fullName !== undefined && typeof body.fullName !== "string") throw new HttpError(400, "INVALID_BODY", "fullName must be a string");
  if (body.email !== undefined && typeof body.email !== "string") throw new HttpError(400, "INVALID_BODY", "email must be a string");
  if (body.branchId !== undefined && body.branchId !== null && typeof body.branchId !== "string") throw new HttpError(400, "INVALID_BODY", "branchId must be a string or null");
  const request = { action: body.action, userId: body.userId, fullName: typeof body.fullName === "string" ? body.fullName.trim() : undefined, email: typeof body.email === "string" ? body.email.trim().toLowerCase() : undefined, branchId: body.branchId === null ? null : body.branchId } as WorkerRequest;
  if (request.action === "create" && (!request.fullName || request.fullName.length < 2 || request.fullName.length > 120 || !request.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.email))) throw new HttpError(400, "INVALID_BODY", "A valid full name and email are required");
  if (request.action !== "create" && !request.userId) throw new HttpError(400, "INVALID_BODY", "userId is required");
  return request;
}
