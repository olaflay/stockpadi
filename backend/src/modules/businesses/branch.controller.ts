import { authenticateRequest } from "../../middleware/authenticate.js";
import { supabaseAdmin, supabaseForAccessToken } from "../../shared/supabase/client.js";
import { resolveAccountContext } from "../accounts/account-context.js";
import { requireCapability } from "../authorization/capabilities.js";
import { HttpError } from "../../shared/errors/http-error.js";

export async function handleBranchList(request: globalThis.Request) {
  const auth = await authenticateRequest(request);
  const db = supabaseForAccessToken(auth.accessToken);
  const context = await resolveAccountContext(supabaseAdmin(), auth.user);
  if (!context.businessId) throw new HttpError(403, "FORBIDDEN", "A business account is required");
  const { data, error } = await db.from("branches").select("id, name, is_active, is_primary, business_id, updated_at").eq("business_id", context.businessId).order("name");
  if (error) throw new HttpError(500, "BRANCHES_LOAD_FAILED", error.message);
  return { branches: data ?? [] };
}

export async function handleBranchCreate(request: globalThis.Request, body: unknown) {
  const auth = await authenticateRequest(request);
  const db = supabaseAdmin();
  const context = await resolveAccountContext(db, auth.user);
  if (!context.businessId) throw new HttpError(403, "FORBIDDEN", "A business account is required");
  requireBranchManagement(context);
  if (!body || typeof body !== "object" || typeof (body as Record<string, unknown>).name !== "string") throw new HttpError(400, "INVALID_BODY", "Branch name is required");
  const name = ((body as Record<string, unknown>).name as string).trim();
  if (!name) throw new HttpError(400, "INVALID_BODY", "Branch name is required");
  const { count, error: countError } = await db.from("branches").select("id", { count: "exact", head: true }).eq("business_id", context.businessId).eq("is_active", true);
  if (countError) throw new HttpError(500, "BRANCHES_LOAD_FAILED", countError.message);
  if ((count ?? 0) >= 6) throw new HttpError(409, "BRANCH_LIMIT_REACHED", "Only 6 active branches are allowed");
  const id = body && typeof body === "object" && typeof (body as Record<string, unknown>).id === "string" ? (body as Record<string, unknown>).id as string : crypto.randomUUID();
  const { data, error } = await db.rpc("sync_apply_branch", { payload: { id, name, isActive: true, isPrimary: body && typeof body === "object" && (body as Record<string, unknown>).isPrimary === true }, actor_id: auth.user.id });
  if (error) throw new HttpError(500, "BRANCH_CREATE_FAILED", error.message);
  return data;
}

function requireBranchManagement(context: Awaited<ReturnType<typeof resolveAccountContext>>): void {
  if (context.accountType === "BUSINESS_OWNER") return;
  requireCapability(context, "MANAGE_BRANCHES");
}

export async function handleBranchMutation(request: globalThis.Request, branchId: string, body: unknown) {
  const auth = await authenticateRequest(request);
  const db = supabaseAdmin();
  const context = await resolveAccountContext(db, auth.user);
  if (!context.businessId) throw new HttpError(403, "FORBIDDEN", "A business account is required");
  requireBranchManagement(context);
  const existing = await db.from("branches").select("id, name, is_active, is_primary").eq("id", branchId).eq("business_id", context.businessId).maybeSingle();
  if (existing.error || !existing.data) throw new HttpError(404, "NOT_FOUND", "Branch not found");
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const payload = { id: branchId, name: typeof input.name === "string" ? input.name.trim() : existing.data.name, isActive: request.method !== "DELETE" && input.isActive !== false, isPrimary: input.isPrimary === undefined ? existing.data.is_primary === true : input.isPrimary === true };
  const { data, error } = await db.rpc("sync_apply_branch", { payload, actor_id: auth.user.id });
  if (error) throw new HttpError(409, "BRANCH_UPDATE_FAILED", error.message);
  return data;
}
