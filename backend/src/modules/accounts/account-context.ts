import type { SupabaseClient, User } from "@supabase/supabase-js";
import { HttpError } from "../../shared/errors/http-error.js";

export type AccountType = "ADMIN" | "BUSINESS_OWNER" | "WORKER";

export interface AccountContext {
  userId: string;
  accountType: AccountType;
  businessId: string | null;
  businessStatus: string | null;
  membershipStatus: string | null;
  branchIds: string[];
}

export async function resolveAccountContext(db: SupabaseClient, user: User, options: { allowPendingOwner?: boolean } = {}): Promise<AccountContext> {
  const { data: rawData, error } = await db.rpc("resolve_account_context", { p_user_id: user.id, p_allow_pending_owner: options.allowPendingOwner ?? false }).maybeSingle();
  if (error) throw new HttpError(500, "ACCOUNT_CONTEXT_FAILED", error.message);
  const data = rawData as { user_id: string; account_type: string; business_id: string | null; business_status: string | null; membership_status: string | null; branch_ids: string[] | null } | null;
  if (!data || data.user_id !== user.id) throw new HttpError(403, "FORBIDDEN", "No active account context found");
  if (data.account_type !== "ADMIN" && (data.membership_status !== "active" || !data.business_id || (!["verified", "active"].includes(data.business_status ?? "") && !(options.allowPendingOwner && data.account_type === "BUSINESS_OWNER" && data.business_status === "pending")))) {
    throw new HttpError(403, "FORBIDDEN", "Account is not active for business operations");
  }
  if (!["ADMIN", "BUSINESS_OWNER", "WORKER"].includes(data.account_type)) {
    throw new HttpError(403, "FORBIDDEN", "Unsupported account type");
  }
  return {
    userId: data.user_id,
    accountType: data.account_type as AccountType,
    businessId: data.business_id,
    businessStatus: data.business_status,
    membershipStatus: data.membership_status,
    branchIds: data.branch_ids ?? [],
  };
}
