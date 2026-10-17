export const PWA_UPDATE_REQUIRED_EVENT = "stockpadi:pwa-update-required";
export const PWA_DATABASE_BLOCKED_EVENT = "stockpadi:pwa-database-blocked";
export const PWA_DATABASE_READY_EVENT = "stockpadi:pwa-database-ready";
export const PWA_DATA_REFRESH_EVENT = "stockpadi:data-refresh";

export function notifyPwaUpdateRequired(reason: string): void {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(new CustomEvent(PWA_UPDATE_REQUIRED_EVENT, { detail: { reason } }));
}

export function notifyPwaDatabaseBlocked(): void {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(new CustomEvent(PWA_DATABASE_BLOCKED_EVENT));
}

export function notifyPwaDatabaseReady(): void {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(new CustomEvent(PWA_DATABASE_READY_EVENT));
}

export function notifyPwaDataRefresh(): void {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(new CustomEvent(PWA_DATA_REFRESH_EVENT));
}

export const PWA_STORAGE_QUOTA_EXCEEDED_EVENT = "stockpadi:storage-quota-exceeded";

export function notifyPwaStorageQuotaExceeded(details?: { remainingBytes?: number }): void {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(new CustomEvent(PWA_STORAGE_QUOTA_EXCEEDED_EVENT, { detail: details ?? {} }));
}
