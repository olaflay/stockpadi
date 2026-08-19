import { HttpError } from "../../shared/errors/http-error.js";

export interface VoidSaleRequest { saleId: string; reason?: string | null; }
export function parseVoidSaleRequest(input: unknown): VoidSaleRequest {
  if (!input || typeof input !== "object") throw new HttpError(400, "INVALID_BODY", "Request body must be an object");
  const body = input as Record<string, unknown>;
  if (typeof body.saleId !== "string" || !body.saleId) throw new HttpError(400, "INVALID_BODY", "saleId is required");
  if (body.reason !== undefined && body.reason !== null && typeof body.reason !== "string") throw new HttpError(400, "INVALID_BODY", "reason must be a string");
  return { saleId: body.saleId, reason: typeof body.reason === "string" ? body.reason.trim() || null : null };
}
