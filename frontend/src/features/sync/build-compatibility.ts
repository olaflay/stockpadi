import { CLIENT_COMPATIBILITY_VERSION } from "@stockpadi/contracts/config";
import { notifyPwaUpdateRequired } from "@/lib/pwa-update-events";

const VERSION_CHECK_TIMEOUT_MS = 3_500;
const VERSION_CHECK_TTL_MS = 5_000;

interface BackendVersion {
  build?: string;
  minClient?: string;
}

export interface BuildCheckResult {
  compatible: boolean;
  verified: boolean;
}

let inFlight: Promise<BuildCheckResult> | null = null;
let pausedForUpgrade = false;
let lastCheckedAt = 0;
let lastResult: BuildCheckResult = { compatible: true, verified: false };

function versionParts(value: string): number[] | null {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.exec(value);
  return match ? match.slice(1, 4).map(Number) : null;
}

export function isClientVersionBelow(client: string, minimum: string): boolean {
  const actual = versionParts(client);
  const required = versionParts(minimum);
  if (!actual || !required) return false;
  for (let index = 0; index < 3; index += 1) {
    if (actual[index] !== required[index]) return actual[index]! < required[index]!;
  }
  return false;
}

export function pauseSyncForClientUpgrade(reason = "Update required before syncing."): void {
  pausedForUpgrade = true;
  notifyPwaUpdateRequired(reason);
}

export function isSyncPausedForClientUpgrade(): boolean {
  return pausedForUpgrade;
}

/** Inspect compatibility metadata carried by every Node API response. */
export function observeBackendCompatibility(headers: Headers, status: number, errorCode?: string): BuildCheckResult {
  const minimum = headers.get("x-min-client-version");
  const requiresUpgrade = status === 426 || errorCode === "CLIENT_UPGRADE_REQUIRED" || Boolean(
    minimum && isClientVersionBelow(CLIENT_COMPATIBILITY_VERSION, minimum),
  );
  if (requiresUpgrade) {
    pauseSyncForClientUpgrade("A newer app update is needed before your saved changes can sync.");
    return { compatible: false, verified: true };
  }
  return { compatible: true, verified: Boolean(headers.get("x-build-version") || minimum) };
}

/**
 * Ask the server for its minimum supported client before each sync. Older
 * servers return 404 and remain usable because this release keeps old request
 * shapes; a network failure is not treated as a version mismatch.
 */
export function ensureBackendBuildCompatibility(force = false): Promise<BuildCheckResult> {
  if (process.env.NODE_ENV === "test" || typeof window === "undefined" || !navigator.onLine) {
    return Promise.resolve({ compatible: !pausedForUpgrade, verified: false });
  }
  if (inFlight) return inFlight;
  if (!force && Date.now() - lastCheckedAt < VERSION_CHECK_TTL_MS) return Promise.resolve(lastResult);
  inFlight = checkBackendVersion().then((result) => {
    lastResult = result;
    lastCheckedAt = Date.now();
    return result;
  }).finally(() => { inFlight = null; });
  return inFlight;
}

async function checkBackendVersion(): Promise<BuildCheckResult> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), VERSION_CHECK_TIMEOUT_MS);
  try {
    const response = await fetch("/api/version", {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-cache",
        "X-Client-Version": CLIENT_COMPATIBILITY_VERSION,
      },
      signal: controller.signal,
    });
    const headerResult = observeBackendCompatibility(response.headers, response.status);
    if (!response.ok) {
      // A 404/405 is the expected response from a backend deployed before the
      // compatibility endpoint existed. The old payload contract stays valid.
      return response.status === 404 || response.status === 405
        ? { compatible: true, verified: false }
        : headerResult;
    }
    const identity = await response.json() as BackendVersion;
    if (typeof identity.minClient !== "string") return { compatible: true, verified: false };
    if (isClientVersionBelow(CLIENT_COMPATIBILITY_VERSION, identity.minClient)) {
      pauseSyncForClientUpgrade("A newer app update is needed before your saved changes can sync.");
      return { compatible: false, verified: true };
    }
    pausedForUpgrade = false;
    return { compatible: true, verified: true };
  } catch {
    return { compatible: !pausedForUpgrade, verified: false };
  } finally {
    window.clearTimeout(timeout);
  }
}
