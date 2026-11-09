import { notifyPwaStorageQuotaExceeded } from "@/lib/pwa-update-events";

export interface StoragePersistenceStatus {
  persisted: boolean;
  quotaBytes?: number;
  usageBytes?: number;
  remainingBytes?: number;
}

/**
 * Checks and requests persistent storage quota from the browser.
 * Where supported, persistent storage reduces the risk of automatic browser eviction.
 * It cannot protect against user-cleared data, device loss, every browser policy, or a full disk.
 */
export async function ensureStoragePersistence(): Promise<StoragePersistenceStatus> {
  if (typeof navigator === "undefined" || !navigator.storage) {
    return { persisted: false };
  }

  let persisted = false;
  try {
    if (typeof navigator.storage.persisted === "function") {
      persisted = await navigator.storage.persisted();
    }
    if (!persisted && typeof navigator.storage.persist === "function") {
      persisted = await navigator.storage.persist();
    }
  } catch {
    // Some standalone webview runtimes expose the API but throw on access
    persisted = false;
  }

  let quotaBytes: number | undefined;
  let usageBytes: number | undefined;
  let remainingBytes: number | undefined;

  try {
    if (typeof navigator.storage.estimate === "function") {
      const estimate = await navigator.storage.estimate();
      quotaBytes = estimate.quota;
      usageBytes = estimate.usage;
      if (typeof quotaBytes === "number" && typeof usageBytes === "number") {
        remainingBytes = Math.max(0, quotaBytes - usageBytes);
      }
    }
  } catch {
    // Non-blocking estimate failure
  }

  return { persisted, quotaBytes, usageBytes, remainingBytes };
}

/**
 * Detects whether an error thrown during storage writes is a DOMException QuotaExceededError.
 */
export function isQuotaExceededError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; code?: unknown; inner?: unknown; cause?: unknown };

  if (candidate.name === "QuotaExceededError" || candidate.code === 22 || candidate.code === 1014) {
    return true;
  }
  if (candidate.inner && isQuotaExceededError(candidate.inner)) {
    return true;
  }
  if (candidate.cause && isQuotaExceededError(candidate.cause)) {
    return true;
  }
  return false;
}

export class StorageQuotaExceededError extends Error {
  readonly code = "STORAGE_QUOTA_EXCEEDED";
  readonly remainingBytes?: number;

  constructor(message = "Device storage is full. Free up space on your device to continue saving changes.", remainingBytes?: number) {
    super(message);
    this.name = "StorageQuotaExceededError";
    this.remainingBytes = remainingBytes;
  }
}

/**
 * Emergency cache eviction: when storage is exhausted, cleans non-essential CacheStorage
 * caches (like older static caches or navigation caches) to free up bytes for the durable ledger.
 */
export async function attemptEmergencyCacheEviction(): Promise<boolean> {
  if (typeof caches === "undefined" || typeof caches.keys !== "function") {
    return false;
  }
  try {
    const keys = await caches.keys();
    let freedAny = false;
    const currentVersion = process.env.NEXT_PUBLIC_BUILD_VERSION ?? "local";
    const currentNavigationCache = `stockpadi-navigation-${currentVersion}`;
    const currentStaticCache = `stockpadi-static-${currentVersion}`;

    // Only remove obsolete, app-owned runtime generations. Never delete the
    // current navigation/static caches or any Serwist precache: doing so while
    // handling a quota error can turn a recoverable full-disk condition into
    // an app that cannot start offline. The worker's activation cleanup owns
    // precache lifecycle because it knows which document/chunk generations
    // must remain atomic.
    for (const key of keys) {
      const obsoleteNavigation = key.startsWith("stockpadi-navigation-") && key !== currentNavigationCache;
      const obsoleteStatic = key.startsWith("stockpadi-static-") && key !== currentStaticCache;
      if (obsoleteNavigation || obsoleteStatic) {
        await caches.delete(key);
        freedAny = true;
      }
    }
    return freedAny;
  } catch {
    return false;
  }
}

/**
 * Evaluates storage and triggers emergency cleanup and notifications if quota is exhausted.
 */
export const handleStorageQuotaFailure: (error: unknown) => Promise<void> = async () => {
  let remainingBytes: number | undefined;
  try {
    const status = await ensureStoragePersistence();
    remainingBytes = status.remainingBytes;
  } catch {
    // Non-blocking
  }

  await attemptEmergencyCacheEviction();
  notifyPwaStorageQuotaExceeded({ remainingBytes });
};
