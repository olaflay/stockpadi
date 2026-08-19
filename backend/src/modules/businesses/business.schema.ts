import { HttpError } from "../../shared/errors/http-error.js";

export interface RegistrationRequest { action?: "complete_oauth"; email?: string; password?: string; fullName?: string; businessName?: string; businessTypeId?: string; }

export function parseRegistration(input: unknown): RegistrationRequest {
  if (!input || typeof input !== "object") throw new HttpError(400, "INVALID_BODY", "Request body must be an object");
  const body = input as Record<string, unknown>;
  for (const field of ["email", "password", "fullName", "businessName", "businessTypeId"]) if (body[field] !== undefined && typeof body[field] !== "string") throw new HttpError(400, "INVALID_BODY", `${field} must be a string`);
  if (body.action !== undefined && body.action !== "complete_oauth") throw new HttpError(400, "INVALID_BODY", "Unknown registration action");
  return { action: body.action as RegistrationRequest["action"], email: typeof body.email === "string" ? body.email.trim().toLowerCase() : undefined, password: body.password as string | undefined, fullName: typeof body.fullName === "string" ? body.fullName.trim() : undefined, businessName: typeof body.businessName === "string" ? body.businessName.trim() : undefined, businessTypeId: typeof body.businessTypeId === "string" ? body.businessTypeId : undefined };
}

export function validateRegistration(request: RegistrationRequest) {
  if (!request.email || !/^\S+@\S+\.\S+$/.test(request.email) || !request.password || request.password.length < 8 || !request.fullName || !request.businessName || !request.businessTypeId) throw new HttpError(400, "INVALID_BODY", "Owner, business and password details are required");
}
