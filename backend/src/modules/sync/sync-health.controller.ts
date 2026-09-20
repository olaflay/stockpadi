import { authenticateRequest } from "../../middleware/authenticate.js";
import { supabaseAdmin } from "../../shared/supabase/client.js";
import { resolveAccountContext } from "../accounts/account-context.js";
import { HttpError } from "../../shared/errors/http-error.js";

export async function handleSyncHealth(request: globalThis.Request) {
  const auth = await authenticateRequest(request);
  const db = supabaseAdmin();
  const context = await resolveAccountContext(db, auth.user);
  if (!context.businessId) throw new HttpError(403, "FORBIDDEN", "A business account is required");
  const { count: totalBranchCount, error: totalError } = await db.from("branches").select("id", { count: "exact", head: true }).eq("business_id", context.businessId);
  const { count: activeBranchCount, error: activeError } = await db.from("branches").select("id", { count: "exact", head: true }).eq("business_id", context.businessId).eq("is_active", true);
  if (totalError || activeError) throw new HttpError(500, "SYNC_HEALTH_FAILED", "Could not read business synchronization context");
  return { ok: true, serverReachable: true, authenticated: true, businessId: context.businessId, businessStatus: context.businessStatus, serverTime: new Date().toISOString(), syncContractVersion: "2026-09-12", activeBranchCount: activeBranchCount ?? 0, totalBranchCount: totalBranchCount ?? 0 };
}
