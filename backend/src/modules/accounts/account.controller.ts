import { authenticateRequest } from "../../middleware/authenticate.js";
import { supabaseAdmin } from "../../shared/supabase/client.js";
import { resolveAccountContext } from "./account-context.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { logger } from "../../shared/logging/logger.js";

type AccountState =
  | "REGISTERED_UNVERIFIED"
  | "EMAIL_VERIFIED_PENDING_ADMIN"
  | "PENDING_ADMIN_APPROVAL"
  | "FULLY_ACTIVATED"
  | "SUSPENDED"
  | "REJECTED";

/**
 * Resolves the caller's account context and returns a machine-readable
 * accountState so the frontend can route to the correct standalone gate page
 * (verify-email, pending-approval) instead of receiving an opaque 403.
 *
 * Fully-activated accounts return the same payload as before plus accountState.
 * SUSPENDED and REJECTED still throw 403 — the frontend error handler catches
 * them and shows a permanent error message.
 */
export async function handleAccountContext(request: globalThis.Request) {
  const auth = await authenticateRequest(request);
  const db = supabaseAdmin();

  // --- ADMIN fast path ---
  // ADMINs are resolved via platform_admins, not business_memberships,
  // so they bypass all business-status gating.
  try {
    const context = await resolveAccountContext(db, auth.user, { allowPendingOwner: false });
    if (context.accountType === "ADMIN") {
      return {
        accountType: "ADMIN",
        accountState: "FULLY_ACTIVATED" as AccountState,
        profile: {
          id: auth.user.id,
          full_name: auth.user.user_metadata?.full_name ?? auth.user.email?.split("@")[0] ?? "Admin",
          role: "admin",
          account_type: "ADMIN",
          is_active: true,
          business_id: null,
          email_verified: true,
        },
        permissions: [],
        branchIds: [],
      };
    }

    // WORKER or FULLY_ACTIVATED BUSINESS_OWNER
    const { data: profile, error } = await db
      .from("users")
      .select("id, full_name, role, account_type, is_active, business_id, email_verified")
      .eq("id", auth.user.id)
      .maybeSingle();
    if (error || !profile) throw new Error("Account profile was not found");

    const isEmailVerified = context.accountType === "BUSINESS_OWNER" ? (profile.email_verified ?? false) : true;
    const accountState: AccountState = isEmailVerified ? "FULLY_ACTIVATED" : "REGISTERED_UNVERIFIED";

    return {
      accountType: context.accountType,
      accountState,
      profile: {
        ...profile,
        role: profile.role ?? (context.accountType === "WORKER" ? "WORKER" : "BUSINESS_OWNER"),
        account_type: context.accountType,
        email_verified: profile.email_verified ?? false,
      },
      permissions: context.permissions,
      businessId: context.businessId,
      membershipStatus: context.membershipStatus,
      businessStatus: context.businessStatus,
      branchIds: context.branchIds,
    };
  } catch (firstError) {
    // Strict resolve failed. Check if this is a pending/unverified BUSINESS_OWNER
    // before surfacing the error — allow pending so we can classify the state.
    let pendingContext;
    try {
      pendingContext = await resolveAccountContext(db, auth.user, { allowPendingOwner: true });
    } catch {
      // Not even a pending owner — truly forbidden.
      throw firstError;
    }

    if (!pendingContext || pendingContext.accountType === "ADMIN") throw firstError;

    const businessStatus = pendingContext.businessStatus;

    if (businessStatus === "suspended") {
      logger.warn("account-context: suspended business", { userId: auth.user.id });
      throw new HttpError(403, "ACCOUNT_SUSPENDED", "Your business account has been suspended. Contact support.");
    }
    if (businessStatus === "rejected") {
      logger.warn("account-context: rejected business", { userId: auth.user.id });
      throw new HttpError(403, "ACCOUNT_REJECTED", "Your business application was not accepted.");
    }

    if (businessStatus !== "pending") throw firstError;

    // Pending business — fetch profile to determine email_verified. Under the
    // current flow no verification email is sent until the admin approves, so
    // a new account is PENDING_ADMIN_APPROVAL (route to /pending-approval).
    // Legacy accounts that verified email while pending stay
    // EMAIL_VERIFIED_PENDING_ADMIN and also route to /pending-approval.
    const { data: profile, error: profileError } = await db
      .from("users")
      .select("id, full_name, role, account_type, is_active, business_id, email_verified")
      .eq("id", auth.user.id)
      .maybeSingle();
    if (profileError || !profile) throw firstError;

    const accountState: AccountState = profile.email_verified
      ? "EMAIL_VERIFIED_PENDING_ADMIN"
      : "PENDING_ADMIN_APPROVAL";

    logger.info("account-context: pending owner classified", {
      userId: auth.user.id,
      accountState,
      businessStatus,
    });

    return {
      accountType: "BUSINESS_OWNER" as const,
      accountState,
      profile: {
        ...profile,
        role: profile.role ?? "BUSINESS_OWNER",
        account_type: "BUSINESS_OWNER" as const,
        email_verified: profile.email_verified ?? false,
      },
      permissions: [],
      businessId: pendingContext.businessId,
      membershipStatus: pendingContext.membershipStatus,
      businessStatus,
      branchIds: [],
    };
  }
}
