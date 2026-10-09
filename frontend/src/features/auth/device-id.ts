const DEVICE_ID_STORAGE_KEY = "stockpadi:device-id";
let volatileDeviceId: string | undefined;

function createDeviceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * A stable per-browser-install identifier, persisted outside Dexie
 * (localStorage) since it must survive even before the local DB has a
 * session row. Used as `devices.id` server-side and as the sync batch's
 * `deviceId`, matching the existing shape in src/types/sync.ts.
 */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  if (volatileDeviceId) return volatileDeviceId;

  try {
    let id = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (!id) {
      id = createDeviceId();
      window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
    }
    volatileDeviceId = id;
    return id;
  } catch {
    // A device id is useful for sync identity, but storage is not guaranteed
    // during installed-app recovery. Keep a per-page fallback instead of
    // crashing session refresh and the authenticated shell.
    volatileDeviceId = createDeviceId();
    return volatileDeviceId;
  }
}
