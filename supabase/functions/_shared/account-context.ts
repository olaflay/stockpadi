import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2";

export type AccountType = "ADMIN" | "BUSINESS_OWNER" | "WORKER";

export interface AccountContext {
  userId: string;
  accountType: AccountType;
  businessId: string | null;
  membershipStatus: string | null;
  businessStatus: string | null;
  workerActive: boolean;
  branchIds: Set<string>;
  permissions: Set<string>;
}

export type AccountContextErrorCode = "ACCOUNT_CONTEXT_FAILED" | "ACCOUNT_NOT_APPROVED" | "BUSINESS_UNAVAILABLE" | "MISSING_CONTEXT" | "FORBIDDEN";
type ContextResult = { context: AccountContext; error: null } | { context: null; error: { code: AccountContextErrorCode; message: string } };

/**
 * Resolve the trusted account context used by privileged Edge Functions.
 *
 * This deliberately uses the membership tables rather than auth metadata or
 * request payload claims. Callers using the service-role client must perform
 * this check themselves because service-role queries bypass RLS.
 */
export async function resolveAccountContext(db: SupabaseClient, user: User): Promise<ContextResult> {
  const { data: rawData, error } = await db.rpc("resolve_account_context", { p_user_id: user.id, p_allow_pending_owner: false }).maybeSingle();
  if (error) return { context: null, error: { code: "ACCOUNT_CONTEXT_FAILED", message: error.message } };
  const data = rawData as { user_id: string; account_type: string; business_id: string | null; business_status: string | null; membership_status: string | null; branch_ids: string[] | null } | null;
  if (!data || data.user_id !== user.id) {
    const { data: pendingRaw } = await db.rpc("resolve_account_context", { p_user_id: user.id, p_allow_pending_owner: true }).maybeSingle();
    const pendingData = pendingRaw as { business_status: string | null; membership_status: string | null } | null;
    if (pendingData?.business_status === "pending") {
      return { context: null, error: { code: "BUSINESS_UNAVAILABLE", message: "This business is awaiting approval. Cloud sync will resume automatically once it is verified." } };
    }
    if (pendingData?.membership_status === "pending") {
      return { context: null, error: { code: "ACCOUNT_NOT_APPROVED", message: "Account is not approved. Please wait for approval." } };
    }
    return { context: null, error: { code: "MISSING_CONTEXT", message: "No active account context found" } };
  }
  // A Worker is granted exactly the permissions an owner enabled for them —
  // never a full fallback set, so "disable everything" is honest. Owners and
  // admins carry the full worker capability surface.
  let permissions = new Set<string>();
  if (data.account_type === "WORKER") {
    const { data: grants, error: grantsError } = await db.from("worker_permissions").select("permission").eq("user_id", user.id).eq("business_id", data.business_id).eq("enabled", true);
    if (grantsError) return { context: null, error: { code: "ACCOUNT_CONTEXT_FAILED", message: grantsError.message } };
    permissions = new Set((grants as Array<{ permission: string }>).map((grant) => grant.permission));
  } else {
    permissions = new Set([
      "POS_SELL", "VIEW_PRODUCTS", "VIEW_BRANCH_STOCK", "VIEW_STOCK_MOVEMENTS",
      "SUBMIT_STOCK_COUNT", "SUBMIT_RECONCILIATION", "VIEW_CUSTOMERS",
      "USE_CUSTOMER_CREDIT", "VIEW_OWN_SALES", "VIEW_RECEIPTS", "VIEW_ALERTS",
    ]);
  }
  return {
    context: {
      userId: data.user_id,
      accountType: data.account_type as AccountType,
      businessId: data.business_id,
      membershipStatus: data.membership_status,
      businessStatus: data.business_status,
      workerActive: data.account_type !== "WORKER" || data.membership_status === "active",
      branchIds: new Set<string>(data.branch_ids ?? []),
      permissions,
    },
    error: null,
  };
}
