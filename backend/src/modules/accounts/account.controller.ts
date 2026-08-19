import { authenticateRequest } from "../../middleware/authenticate.js";
import { supabaseAdmin } from "../../shared/supabase/client.js";
import { resolveAccountContext } from "./account-context.js";

export async function handleAccountContext(request: globalThis.Request) {
  const auth = await authenticateRequest(request);
  const db = supabaseAdmin();
  const context = await resolveAccountContext(db, auth.user);
  if (context.accountType === "ADMIN") {
    return { accountType: "ADMIN", profile: { id: auth.user.id, full_name: auth.user.user_metadata?.full_name ?? auth.user.email?.split("@")[0] ?? "Admin", role: "admin", account_type: "ADMIN", is_active: true, business_id: null }, permissions: [], branchIds: [] };
  }
  const { data: profile, error } = await db.from("users").select("id, full_name, role, account_type, is_active, business_id").eq("id", auth.user.id).maybeSingle();
  if (error || !profile) throw new Error("Account profile was not found");
  return { accountType: context.accountType, profile: { ...profile, account_type: context.accountType }, permissions: [], businessId: context.businessId, membershipStatus: context.membershipStatus, businessStatus: context.businessStatus, branchIds: context.branchIds };
}
