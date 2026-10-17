import { notifyPwaStorageQuotaExceeded } from "@/lib/pwa-update-events";

export interface StoragePersistenceStatus {
  persisted: boolean;
  quotaBytes?: number;
  usageBytes?: number;
  remainingBytes?: number;
}

/**
 * Checks and requests persistent storage quota from the browser.
 * On Chromium Android, persistent storage prevents the OS Low Memory/Storage Janitor
 * from automatically evicting IndexedDB and local-first ledger data under disk pressure (<100MB).
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
    // Evict older caches, dynamic images or legacy caches if present
    for (const key of keys) {
      if (
        key.includes("image") ||
        key.includes("navigation") ||
        key.includes("legacy") ||
        key.includes("precache")
      ) {
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
export async function handleStorageQuotaFailure(error: unknown): Promise<void> {
  let remainingBytes: number | undefined;
  try {
    const status = await ensureStoragePersistence();
    remainingBytes = status.remainingBytes;
  } catch {
    // Non-blocking
  }

  await attemptEmergencyCacheEviction();
  notifyPwaStorageQuotaExceeded({ remainingBytes });
}
