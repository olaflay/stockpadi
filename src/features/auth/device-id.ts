const DEVICE_ID_STORAGE_KEY = "stockpadi:device-id";

/**
 * A stable per-browser-install identifier, persisted outside Dexie
 * (localStorage) since it must survive even before the local DB has a
 * session row. Used as `devices.id` server-side and as the sync batch's
 * `deviceId`, matching the existing shape in src/types/sync.ts.
 */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  let id = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
  }
  return id;
}
