export type MerchantBackupCategory = "healthy" | "offline" | "action_needed";

export interface MerchantBackupStatusView {
  category: MerchantBackupCategory;
  badge: string;
  headline: string;
  subtext: string;
  timestamp: string;
  storageReassurance?: string;
  invariantReassurance?: string;
}

export function formatFriendlyTimestamp(value: string | null | undefined): string {
  if (!value) return "No cloud backup yet";
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0 || Number.isNaN(diffMs)) return "Just now";
  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 60) return "Just now";
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins === 1) return "Last saved 1 min ago";
  if (diffMins < 60) return `Last saved ${diffMins} mins ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return "Last saved 1 hour ago";
  if (diffHours < 24) return `Last saved ${diffHours} hours ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Last saved yesterday";
  if (diffDays < 7) return `Last saved ${diffDays} days ago`;
  return `Last saved on ${date.toLocaleDateString()}`;
}

export interface ResolveMerchantBackupStatusOptions {
  online: boolean;
  awaitingApproval: boolean;
  cloud: "unknown" | "connected" | "failed";
  cloudError: string | null;
  safetyRequired: boolean;
  pullFailed: boolean;
  lastPullErrorCode: string | null | undefined;
  issuesCount: number;
  pendingCount: number;
  hasConflicts: boolean;
  lastSavedAt: string | null | undefined;
  isBusy: boolean;
  storagePersisted?: boolean | null;
  quarantinedCount?: number;
  ledgerSumMatches?: boolean;
}

export function resolveMerchantBackupStatus({
  online,
  awaitingApproval,
  cloud,
  cloudError,
  safetyRequired,
  pullFailed,
  lastPullErrorCode,
  issuesCount,
  pendingCount,
  hasConflicts,
  lastSavedAt,
  isBusy,
  storagePersisted,
  quarantinedCount,
  ledgerSumMatches,
}: ResolveMerchantBackupStatusOptions): MerchantBackupStatusView {
  const timestamp = formatFriendlyTimestamp(lastSavedAt);

  // 1. Offline takes precedence: merchant needs calm reassurance that local work is safe
  // and local storage persistence guarantees durable buffering.
  if (!online) {
    const storageReassurance =
      storagePersisted === true
        ? "Protected device storage active: all offline sales and stock entries are safeguarded."
        : "Offline storage active: all sales and stock records are buffered locally on this device.";

    return {
      category: "offline",
      badge: "Working Offline",
      headline: "All changes saved safely on this device",
      subtext:
        "You can keep selling and managing stock normally. Everything will back up to the cloud automatically once your internet connection returns.",
      timestamp,
      storageReassurance,
    };
  }

  // 2. Action Needed: human instructions for account, security, or conflict steps
  if (cloudError === "UNAUTHENTICATED" || lastPullErrorCode === "UNAUTHENTICATED") {
    return {
      category: "action_needed",
      badge: "Action Needed",
      headline: "Action needed",
      subtext: "Sign in again to continue backing up.",
      timestamp,
    };
  }

  if (cloudError === "PROJECT_MISMATCH") {
    return {
      category: "action_needed",
      badge: "Action Needed",
      headline: "Action needed",
      subtext:
        "The app is connected to an updated store system. Refresh the page or contact support to continue backing up.",
      timestamp,
    };
  }

  if (safetyRequired) {
    return {
      category: "action_needed",
      badge: "Action Needed",
      headline: "Action needed",
      subtext: "Connect to the internet to back up recent sales and keep the app open.",
      timestamp,
    };
  }

  if (awaitingApproval) {
    return {
      category: "action_needed",
      badge: "Action Needed",
      headline: "Action needed",
      subtext:
        "Your store account is being verified. All changes remain safely saved on this device and will back up once approved.",
      timestamp,
    };
  }

  if (hasConflicts) {
    return {
      category: "action_needed",
      badge: "Action Needed",
      headline: "Action needed",
      subtext: "An item was edited on another device. Choose which version you want to keep below.",
      timestamp,
    };
  }

  if (quarantinedCount && quarantinedCount > 0) {
    return {
      category: "action_needed",
      badge: "Action Needed",
      headline: "Action needed",
      subtext: "One change needs review. Your other sales and records are continuing to back up normally.",
      timestamp,
    };
  }

  if (cloud === "failed" || pullFailed || issuesCount > 0) {
    return {
      category: "action_needed",
      badge: "Action Needed",
      headline: "Action needed",
      subtext:
        "Could not reach the backup server right now. Check your internet connection and try backing up again. All changes are safe on this device.",
      timestamp,
    };
  }

  // 3. Healthy: active backup in flight or everything verified and up to date
  if (isBusy) {
    return {
      category: "healthy",
      badge: "Backing Up",
      headline: "Backing up now",
      subtext: "Saving your recent changes and checking for cloud updates.",
      timestamp,
    };
  }

  if (pendingCount > 0) {
    return {
      category: "healthy",
      badge: "Saving",
      headline: "Saving to cloud",
      subtext: "All changes are saved safely on this device and are uploading to the cloud.",
      timestamp,
    };
  }

  return {
    category: "healthy",
    badge: "Backed Up",
    headline: "Everything backed up",
    subtext: "All sales, stock, and records on this device are backed up to the cloud and up to date.",
    timestamp,
    invariantReassurance:
      ledgerSumMatches !== false ? "Stock counts and sales records match the cloud." : undefined,
  };
}
