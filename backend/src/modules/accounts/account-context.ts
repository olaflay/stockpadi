import type { SupabaseClient, User } from "@supabase/supabase-js";
import { HttpError } from "../../shared/errors/http-error.js";
import { logger } from "../../shared/logging/logger.js";
import { WORKER_CAPABILITIES, type WorkerCapability } from "../authorization/capabilities.js";

export type AccountType = "ADMIN" | "BUSINESS_OWNER" | "WORKER";

export interface AccountContext {
  userId: string;
  accountType: AccountType;
  businessId: string | null;
  businessStatus: string | null;
  membershipStatus: string | null;
  branchIds: string[];
  permissions: WorkerCapability[];
}

export async function resolveAccountContext(db: SupabaseClient, user: User, options: { allowPendingOwner?: boolean } = {}): Promise<AccountContext> {
  const { data: rawData, error } = await db.rpc("resolve_account_context", { p_user_id: user.id, p_allow_pending_owner: options.allowPendingOwner ?? false }).maybeSingle();
  if (error) {
    logger.error("account context RPC failed", { userId: user.id }, error);
    throw new HttpError(500, "ACCOUNT_CONTEXT_FAILED", error.message);
  }
  const data = rawData as { user_id: string; account_type: string; business_id: string | null; business_status: string | null; membership_status: string | null; branch_ids: string[] | null } | null;
  if (!data || data.user_id !== user.id) {
    logger.warn("account context missing", { userId: user.id, email: user.email });
    throw new HttpError(403, "FORBIDDEN", "No active account context found");
  }
  if (data.account_type !== "ADMIN" && (data.membership_status !== "active" || !data.business_id || (!["verified", "active"].includes(data.business_status ?? "") && !(options.allowPendingOwner && data.account_type === "BUSINESS_OWNER" && data.business_status === "pending")))) {
    logger.warn("account context rejected", { userId: user.id, accountType: data.account_type, businessId: data.business_id, businessStatus: data.business_status, membershipStatus: data.membership_status });
    throw new HttpError(403, "FORBIDDEN", "Account is not active for business operations");
  }
  if (!["ADMIN", "BUSINESS_OWNER", "WORKER"].includes(data.account_type)) {
    throw new HttpError(403, "FORBIDDEN", "Unsupported account type");
  }
  // A Worker is granted exactly the capabilities an owner enabled for them —
  // never a full fallback set, so "disable everything" is honest. Owners and
  // admins carry the full worker capability surface.
  let permissions: WorkerCapability[] = [];
  if (data.account_type === "WORKER") {
    if (typeof (db as { from?: unknown }).from === "function") {
      const permissionsQuery = db.from?.("worker_permissions") as { select?: unknown } | undefined;
      if (typeof permissionsQuery?.select === "function") {
        const { data: grants, error: grantsError } = await permissionsQuery
          .select("permission")
          .eq("user_id", user.id)
          .eq("business_id", data.business_id)
          .eq("enabled", true);
        if (grantsError) {
          logger.error("worker capability lookup failed", { userId: user.id, businessId: data.business_id }, grantsError);
          throw new HttpError(500, "ACCOUNT_CAPABILITIES_FAILED", grantsError.message);
        }
        permissions = (grants as Array<{ permission: string }>)
          .map((grant) => grant.permission)
          .filter((permission): permission is WorkerCapability => (WORKER_CAPABILITIES as readonly string[]).includes(permission));
      }
    }
  } else {
    permissions = [...WORKER_CAPABILITIES];
  }
  return {
    userId: data.user_id,
    accountType: data.account_type as AccountType,
    businessId: data.business_id,
    businessStatus: data.business_status,
    membershipStatus: data.membership_status,
    branchIds: data.branch_ids ?? [],
    permissions,
  };
}
