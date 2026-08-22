import { authenticateRequest } from "../../middleware/authenticate.js";
import { supabaseAdmin } from "../../shared/supabase/client.js";
import { resolveAccountContext } from "../accounts/account-context.js";
import { requireBusinessOwner } from "../authorization/capabilities.js";
import { HttpError } from "../../shared/errors/http-error.js";

export async function handleBranchList(request: globalThis.Request) {
  const auth = await authenticateRequest(request);
  const db = supabaseAdmin();
  const context = await resolveAccountContext(db, auth.user);
  if (!context.businessId) throw new HttpError(403, "FORBIDDEN", "A business account is required");
  const { data, error } = await db.from("branches").select("id, name, is_active, business_id").eq("business_id", context.businessId).order("name");
  if (error) throw new HttpError(500, "BRANCHES_LOAD_FAILED", error.message);
  return { branches: data ?? [] };
}

export async function handleBranchCreate(request: globalThis.Request, body: unknown) {
  const auth = await authenticateRequest(request);
  const db = supabaseAdmin();
  const context = await resolveAccountContext(db, auth.user);
  if (!context.businessId) throw new HttpError(403, "FORBIDDEN", "A business account is required");
  requireBusinessOwner(context);
  if (!body || typeof body !== "object" || typeof (body as Record<string, unknown>).name !== "string") throw new HttpError(400, "INVALID_BODY", "Branch name is required");
  const name = ((body as Record<string, unknown>).name as string).trim();
  if (!name) throw new HttpError(400, "INVALID_BODY", "Branch name is required");
  const { count, error: countError } = await db.from("branches").select("id", { count: "exact", head: true }).eq("business_id", context.businessId);
  if (countError) throw new HttpError(500, "BRANCHES_LOAD_FAILED", countError.message);
  if ((count ?? 0) >= 6) throw new HttpError(409, "BRANCH_LIMIT_REACHED", "Only 6 branches are allowed");
  const { data, error } = await db.from("branches").insert({ id: crypto.randomUUID(), business_id: context.businessId, name, is_active: true }).select("id, name, is_active, business_id").single();
  if (error) throw new HttpError(500, "BRANCH_CREATE_FAILED", error.message);
  return data;
}
