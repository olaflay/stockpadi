import { HttpError } from "../../shared/errors/http-error.js";

export function parseCustomer(input: unknown) {
  if (!input || typeof input !== "object") throw new HttpError(400, "INVALID_BODY", "Request body must be an object");
  const body = input as Record<string, unknown>;
  if (typeof body.id !== "string" || !body.id || typeof body.name !== "string" || !body.name.trim()) throw new HttpError(400, "INVALID_BODY", "Customer id and name are required");
  if (body.phone !== undefined && body.phone !== null && typeof body.phone !== "string") throw new HttpError(400, "INVALID_BODY", "phone must be a string");
  return { id: body.id, name: body.name.trim(), phone: typeof body.phone === "string" ? body.phone.trim() || null : null, updatedAt: typeof body.updatedAt === "string" ? body.updatedAt : new Date().toISOString() };
}

export function parseCreditPayment(input: unknown) {
  if (!input || typeof input !== "object") throw new HttpError(400, "INVALID_BODY", "Request body must be an object");
  const body = input as Record<string, unknown>;
  if (typeof body.id !== "string" || typeof body.customerId !== "string" || typeof body.amount !== "number" || body.amount <= 0) throw new HttpError(400, "INVALID_BODY", "id, customerId and a positive amount are required");
  return { id: body.id, clientId: typeof body.clientId === "string" ? body.clientId : body.id, customerId: body.customerId, amount: body.amount, note: typeof body.note === "string" ? body.note : null, createdAtLocal: typeof body.createdAtLocal === "string" ? body.createdAtLocal : new Date().toISOString() };
}
