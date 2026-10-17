/**
 * statusMessages.ts
 *
 * Centralized, type-safe status dictionary and error-decoupling engine for all
 * network, connectivity, and background storage reconciliation states.
 *
 * DESIGN PRINCIPLES:
 * 1. Ultra-Short & Fast: Concise, high-contrast microcopy readable in <1 second
 *    on small mobile banners and top header bars.
 * 2. Zero-Jargon Law: Prohibits engineering terms ("sync", "cloud", "refresh",
 *    "outbox", "drain", "stream").
 * 3. Immediate Guarantee: Always makes clear that sales/records are safe on this phone.
 * 4. Zero-Hardcoding Law: Never hardcode brand names ("StockPadi", "OjáPadi").
 */

export type SyncSystemStateId =
  | "OFFLINE_SAFE"
  | "ONLINE_SAVED"
  | "SAVING_IN_PROGRESS"
  | "BACKGROUND_CATALOG_PENDING"
  | "DRAIN_TEMPORARY_NETWORK_ERROR"
  | "DRAIN_BLOCKED_OR_FAILED"
  | "DATA_CONFLICT"
  | "AUTH_EXPIRED"
  | "ACCOUNT_PENDING_APPROVAL"
  | "BRANCH_ACCESS_CHANGED"
  | "SAFETY_BACKPRESSURE_LIMIT"
  | "APP_UPDATE_REQUIRED"
  | "DATABASE_LOCKED_OTHER_TABS"
  | "UNKNOWN_ERROR";

export type SurfaceType = "ambient" | "toast" | "banner" | "modal";
export type StatusSeverity = "info" | "neutral" | "success" | "warning" | "danger";

export interface StatusMessage {
  id: SyncSystemStateId;
  /** Short plain-language headline */
  headline: string;
  /** Short punchy body */
  body: string;
  /** Immediate affirmative guarantee that records are safe on this device */
  cashierGuarantee: string;
  /** Actionable next step or reassurance for the cashier */
  cashierAction: string;
  /** Actionable next step for the business owner */
  ownerAction: string;
  /** Surface type for the cashier */
  cashierSurface: SurfaceType;
  /** Surface type for the business owner */
  ownerSurface: SurfaceType;
  /** Visual tone */
  severity: StatusSeverity;
  /** Compact pill status text for header */
  shortStatus: string;
  /** Action button text (e.g., 'Save now', 'Update now') */
  actionLabel?: string;
}

/** Prohibited technical terms across all user-facing status surfaces */
export const TECHNICAL_LEAK_WORDS = [
  "sync",
  "synced",
  "syncing",
  "cloud",
  "refresh",
  "refreshing",
  "outbox",
  "drain",
  "draining",
  "stream",
  "streaming",
] as const;

export const TECHNICAL_LEAK_REGEX = /\b(sync|synced|syncing|cloud|refresh|refreshing|outbox|drain|draining|stream|streaming)\b/i;

/** Test whether an arbitrary string contains forbidden engineering jargon */
export function containsTechnicalLeak(text: string): boolean {
  return TECHNICAL_LEAK_REGEX.test(text);
}

/** Certified plain-language status dictionary: crisp, short, scannable */
export const STATUS_DICTIONARY: Record<SyncSystemStateId, StatusMessage> = {
  OFFLINE_SAFE: {
    id: "OFFLINE_SAFE",
    headline: "Offline",
    body: "Saved on phone.",
    cashierGuarantee: "Saved on phone. Safe to sell.",
    cashierAction: "Keep selling normally.",
    ownerAction: "Reconnect when convenient.",
    cashierSurface: "ambient",
    ownerSurface: "ambient",
    severity: "info",
    shortStatus: "Offline · Saved",
    actionLabel: "Save now",
  },
  ONLINE_SAVED: {
    id: "ONLINE_SAVED",
    headline: "All saved",
    body: "Up to date.",
    cashierGuarantee: "Saved on phone and backed up.",
    cashierAction: "Keep selling normally.",
    ownerAction: "No action needed.",
    cashierSurface: "ambient",
    ownerSurface: "ambient",
    severity: "success",
    shortStatus: "All saved",
    actionLabel: "Save now",
  },
  SAVING_IN_PROGRESS: {
    id: "SAVING_IN_PROGRESS",
    headline: "Saving",
    body: "Saving changes…",
    cashierGuarantee: "Saved on phone.",
    cashierAction: "Keep selling normally.",
    ownerAction: "Saving changes now.",
    cashierSurface: "ambient",
    ownerSurface: "ambient",
    severity: "neutral",
    shortStatus: "Saving…",
    actionLabel: "Saving…",
  },
  BACKGROUND_CATALOG_PENDING: {
    id: "BACKGROUND_CATALOG_PENDING",
    headline: "Ready",
    body: "Safe to sell.",
    cashierGuarantee: "Saved on phone. Safe to sell.",
    cashierAction: "Keep selling normally.",
    ownerAction: "Updates in background.",
    cashierSurface: "ambient",
    ownerSurface: "ambient",
    severity: "neutral",
    shortStatus: "All saved",
    actionLabel: "Save now",
  },
  DRAIN_TEMPORARY_NETWORK_ERROR: {
    id: "DRAIN_TEMPORARY_NETWORK_ERROR",
    headline: "Waiting to save",
    body: "Saved on phone.",
    cashierGuarantee: "Saved on phone.",
    cashierAction: "Keep selling normally.",
    ownerAction: "Tap Save now to retry.",
    cashierSurface: "ambient",
    ownerSurface: "ambient",
    severity: "warning",
    shortStatus: "Waiting to save",
    actionLabel: "Save now",
  },
  DRAIN_BLOCKED_OR_FAILED: {
    id: "DRAIN_BLOCKED_OR_FAILED",
    headline: "Review needed",
    body: "Some items need review.",
    cashierGuarantee: "Saved on phone.",
    cashierAction: "Tell manager if this stays.",
    ownerAction: "Check Save Details.",
    cashierSurface: "ambient",
    ownerSurface: "banner",
    severity: "danger",
    shortStatus: "Review needed",
    actionLabel: "Save now",
  },
  DATA_CONFLICT: {
    id: "DATA_CONFLICT",
    headline: "Review changes",
    body: "Edited on another phone.",
    cashierGuarantee: "Saved on phone.",
    cashierAction: "Keep selling normally.",
    ownerAction: "Choose version in Save Details.",
    cashierSurface: "ambient",
    ownerSurface: "banner",
    severity: "warning",
    shortStatus: "Review needed",
    actionLabel: "Review",
  },
  AUTH_EXPIRED: {
    id: "AUTH_EXPIRED",
    headline: "Sign-in expired",
    body: "Sign in to keep saving.",
    cashierGuarantee: "Safe on phone.",
    cashierAction: "Sign in again to continue.",
    ownerAction: "Sign in again to continue.",
    cashierSurface: "banner",
    ownerSurface: "banner",
    severity: "warning",
    shortStatus: "Sign in",
    actionLabel: "Sign in",
  },
  ACCOUNT_PENDING_APPROVAL: {
    id: "ACCOUNT_PENDING_APPROVAL",
    headline: "Pending setup",
    body: "Saved on phone until approved.",
    cashierGuarantee: "Saved on phone.",
    cashierAction: "Keep selling normally.",
    ownerAction: "Approval in progress.",
    cashierSurface: "ambient",
    ownerSurface: "banner",
    severity: "warning",
    shortStatus: "Pending",
    actionLabel: "Save now",
  },
  BRANCH_ACCESS_CHANGED: {
    id: "BRANCH_ACCESS_CHANGED",
    headline: "Branch changed",
    body: "Sign in to switch branch.",
    cashierGuarantee: "Saved on phone.",
    cashierAction: "Sign in to switch branch.",
    ownerAction: "Check staff branches in Settings.",
    cashierSurface: "banner",
    ownerSurface: "ambient",
    severity: "warning",
    shortStatus: "Branch updated",
    actionLabel: "Sign in",
  },
  SAFETY_BACKPRESSURE_LIMIT: {
    id: "SAFETY_BACKPRESSURE_LIMIT",
    headline: "Save required",
    body: "Connect to save older sales.",
    cashierGuarantee: "Saved on phone.",
    cashierAction: "Connect and tap Save now.",
    ownerAction: "Connect and tap Save now.",
    cashierSurface: "modal",
    ownerSurface: "modal",
    severity: "danger",
    shortStatus: "Save required",
    actionLabel: "Save now",
  },
  APP_UPDATE_REQUIRED: {
    id: "APP_UPDATE_REQUIRED",
    headline: "Update ready",
    body: "Tap to update app.",
    cashierGuarantee: "Saved on phone.",
    cashierAction: "Update between customers.",
    ownerAction: "Tap Update now.",
    cashierSurface: "banner",
    ownerSurface: "banner",
    severity: "info",
    shortStatus: "Update ready",
    actionLabel: "Update now",
  },
  DATABASE_LOCKED_OTHER_TABS: {
    id: "DATABASE_LOCKED_OTHER_TABS",
    headline: "Close other tabs",
    body: "Close extra tabs to update.",
    cashierGuarantee: "Saved on phone.",
    cashierAction: "Close other browser tabs.",
    ownerAction: "Close other browser tabs.",
    cashierSurface: "banner",
    ownerSurface: "banner",
    severity: "warning",
    shortStatus: "Close other tabs",
    actionLabel: "Close tabs",
  },
  UNKNOWN_ERROR: {
    id: "UNKNOWN_ERROR",
    headline: "Connection issue",
    body: "Saved on this phone.",
    cashierGuarantee: "Safe on phone.",
    cashierAction: "Keep selling normally.",
    ownerAction: "Check connection or tap Save now.",
    cashierSurface: "ambient",
    ownerSurface: "ambient",
    severity: "warning",
    shortStatus: "Offline",
    actionLabel: "Save now",
  },
};

export interface StatusResolutionContext {
  isOnline?: boolean;
  pendingCount?: number;
  failedCount?: number;
  hasConflicts?: boolean;
  runtimePhase?: "idle" | "uploading" | "downloading" | "syncing";
  safetyRequired?: boolean;
  pullFailure?: boolean;
  accountType?: "WORKER" | "BUSINESS_OWNER" | "ADMIN" | string | null;
  businessStatus?: string | null;
  updateRequired?: boolean;
  databaseBlocked?: boolean;
}

/** Extract normalized error codes safely from unknown error candidates */
export function extractErrorCode(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") {
    if (error.startsWith("SYNC_REQUIRED")) return "SYNC_REQUIRED";
    return error.trim();
  }
  if (typeof error === "object") {
    const err = error as Record<string, unknown>;
    if (typeof err.code === "string") return err.code.trim();
    if (typeof err.errorCode === "string") return err.errorCode.trim();
    if (typeof err.status === "number") {
      if (err.status === 401) return "UNAUTHENTICATED";
      if (err.status === 403) return "FORBIDDEN";
      if (err.status === 426) return "CLIENT_UPGRADE_REQUIRED";
    }
    if (err instanceof Error) {
      if (err.message.startsWith("SYNC_REQUIRED")) return "SYNC_REQUIRED";
      if (err.name === "NetworkUnavailableError") return "NETWORK_UNAVAILABLE";
      if (/network|fetch|offline/i.test(err.message)) return "NETWORK_UNAVAILABLE";
    }
  }
  return "UNKNOWN";
}

/** Decouples raw engine exceptions and state flags into certified dictionary IDs */
export function resolveSystemState(
  errorOrCode?: unknown,
  context: StatusResolutionContext = {}
): SyncSystemStateId {
  // 1. Multi-tab database locks
  if (context.databaseBlocked) return "DATABASE_LOCKED_OTHER_TABS";

  // 2. Client update required
  if (context.updateRequired) return "APP_UPDATE_REQUIRED";

  // 3. Inspect specific error codes
  if (errorOrCode) {
    const code = extractErrorCode(errorOrCode);
    if (code === "SYNC_REQUIRED") return "SAFETY_BACKPRESSURE_LIMIT";
    if (["ACCOUNT_NOT_APPROVED", "BUSINESS_UNAVAILABLE"].includes(code)) return "ACCOUNT_PENDING_APPROVAL";
    if (["PULL_BRANCH_SCOPE_MISMATCH", "BRANCH_MISMATCH"].includes(code)) return "BRANCH_ACCESS_CHANGED";
    if (["UNAUTHENTICATED", "AUTH_SESSION_EXPIRED", "JWT_EXPIRED"].includes(code)) return "AUTH_EXPIRED";
    if (code === "FORBIDDEN") return "BRANCH_ACCESS_CHANGED";
    if (["CONFLICT", "CAUSAL_CONFLICT"].includes(code)) return "DATA_CONFLICT";
    if (code === "CLIENT_UPGRADE_REQUIRED") return "APP_UPDATE_REQUIRED";
    if (["NETWORK_UNAVAILABLE", "FETCH_TIMEOUT", "TIMEOUT", "ECONNABORTED"].includes(code)) {
      return context.isOnline === false ? "OFFLINE_SAFE" : "DRAIN_TEMPORARY_NETWORK_ERROR";
    }
    // Any unclassified error object passed in
    return "UNKNOWN_ERROR";
  }

  // 4. Safety backpressure limit (>= 100 unsaved rows older than 48 hours)
  if (context.safetyRequired) return "SAFETY_BACKPRESSURE_LIMIT";

  // 5. Explicit offline state
  if (context.isOnline === false) return "OFFLINE_SAFE";

  // 6. Conflicting items needing review
  if (context.hasConflicts) return "DATA_CONFLICT";

  // 7. Durable failed mutations
  if ((context.failedCount ?? 0) > 0) return "DRAIN_BLOCKED_OR_FAILED";

  // 8. Actively uploading local sales
  if (context.runtimePhase === "uploading" || context.runtimePhase === "syncing") {
    return "SAVING_IN_PROGRESS";
  }

  // 9. Pending local sales waiting to upload
  if ((context.pendingCount ?? 0) > 0) {
    return "DRAIN_TEMPORARY_NETWORK_ERROR";
  }

  // 10. Background catalog download pending / dropped while local sales are 100% safe
  // Ambient demotion: catalog download drops are completely non-disruptive
  if (context.pullFailure || context.runtimePhase === "downloading") {
    return "BACKGROUND_CATALOG_PENDING";
  }

  // 11. Normal healthy state
  return "ONLINE_SAVED";
}

/** Complete decoupling entrypoint: guaranteed to return a certified StatusMessage */
export function resolveStatusMessage(
  errorOrCode?: unknown,
  context: StatusResolutionContext = {}
): StatusMessage {
  const stateId = resolveSystemState(errorOrCode, context);
  return STATUS_DICTIONARY[stateId] ?? STATUS_DICTIONARY.UNKNOWN_ERROR;
}

/** Checks whether a status warrants disruptive UI (banners/modals) for a cashier */
export function isDisruptiveToCashier(status: StatusMessage): boolean {
  return status.cashierSurface === "modal" || (status.cashierSurface === "banner" && status.severity === "danger");
}
