import { db, withDatabaseClosedRecovery } from "@/lib/db";
import { getLocalBusinessId } from "@/lib/local-tenant";

const LEASE_ID = "global-sync";
const LEASE_TTL_MS = 45_000;

export interface SyncLeaseOptions {
  /** Wait for an existing owner instead of returning immediately. */
  waitForLease?: boolean;
}

let ownerId: string | null = null;
let leaseDepth = 0;
let heartbeat: ReturnType<typeof setInterval> | null = null;

function getOwnerId(): string {
  if (ownerId) return ownerId;
  ownerId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `sync-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return ownerId;
}

async function acquireDurableLease(): Promise<boolean> {
  const businessId = (await getLocalBusinessId()) ?? "unknown";
  const now = Date.now();
  const currentOwnerId = getOwnerId();
  const acquiredAt = new Date(now).toISOString();
  const expiresAt = new Date(now + LEASE_TTL_MS).toISOString();

  return withDatabaseClosedRecovery(() => db.transaction("rw", db.syncLeases, async () => {
    const current = await db.syncLeases.get(LEASE_ID);
    if (current && current.ownerId !== currentOwnerId && current.expiresAt > acquiredAt) return false;
    await db.syncLeases.put({ id: LEASE_ID, businessId, ownerId: currentOwnerId, acquiredAt, expiresAt });
    return true;
  }));
}

async function renewDurableLease(): Promise<void> {
  const currentOwnerId = getOwnerId();
  const expiresAt = new Date(Date.now() + LEASE_TTL_MS).toISOString();
  await withDatabaseClosedRecovery(() => db.transaction("rw", db.syncLeases, async () => {
    const current = await db.syncLeases.get(LEASE_ID);
    if (current?.ownerId === currentOwnerId) await db.syncLeases.update(LEASE_ID, { expiresAt });
  }));
}

const LEASE_EVENT_CHANNEL = "stockpadi-sync-lease-events";

function broadcastLeaseRelease(): void {
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(LEASE_EVENT_CHANNEL);
      channel.postMessage({ type: "released", timestamp: Date.now() });
      channel.close();
    }
  } catch {
    // BroadcastChannel unsupported or blocked in isolated contexts
  }
}

async function waitForLeaseReleaseOrTimeout(timeoutMs: number): Promise<void> {
  if (typeof BroadcastChannel === "undefined") {
    await new Promise((resolve) => setTimeout(resolve, timeoutMs));
    return;
  }
  await new Promise<void>((resolve) => {
    let resolved = false;
    let channel: BroadcastChannel | null = null;
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);

    const cleanup = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      try {
        channel?.close();
      } catch {}
    };

    try {
      channel = new BroadcastChannel(LEASE_EVENT_CHANNEL);
      channel.onmessage = (event) => {
        if (event?.data?.type === "released") {
          cleanup();
          resolve();
        }
      };
    } catch {
      cleanup();
      resolve();
    }
  });
}

async function releaseDurableLease(): Promise<void> {
  const currentOwnerId = getOwnerId();
  await withDatabaseClosedRecovery(() => db.transaction("rw", db.syncLeases, async () => {
    const current = await db.syncLeases.get(LEASE_ID);
    if (current?.ownerId === currentOwnerId) await db.syncLeases.delete(LEASE_ID);
  }));
  broadcastLeaseRelease();
}

async function runOwned<T>(work: () => Promise<T>): Promise<T> {
  leaseDepth += 1;
  try {
    return await work();
  } finally {
    leaseDepth -= 1;
  }
}

/**
 * Runs one sync-critical section with browser-wide single-flight protection.
 * Web Locks is preferred; the Dexie lease is the durable fallback for browsers
 * without Web Locks. Nested calls are allowed so the coordinator and the
 * compatibility drain entry point share the same ownership boundary.
 */
export async function withSyncLease<T>(work: () => Promise<T>, options: SyncLeaseOptions = {}): Promise<T | null> {
  if (leaseDepth > 0) return runOwned(work);

  const MAX_LEASE_WAIT_MS = 5_000;

  if (typeof navigator !== "undefined" && navigator.locks) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), MAX_LEASE_WAIT_MS) : null;
    try {
      return await navigator.locks.request(
        "stockpadi-sync-coordinator",
        {
          ifAvailable: !options.waitForLease,
          ...(options.waitForLease && controller ? { signal: controller.signal } : {}),
        },
        async (lock) => {
          if (!lock) return null;
          return runOwned(work);
        }
      );
    } catch {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  if (options.waitForLease) {
    const start = Date.now();
    let attempt = 0;
    while (!(await acquireDurableLease())) {
      const elapsed = Date.now() - start;
      if (elapsed >= MAX_LEASE_WAIT_MS) return null;
      const remaining = MAX_LEASE_WAIT_MS - elapsed;
      // Exponential backoff capped at 400ms, immediately waking on BroadcastChannel release event
      const backoff = Math.min(remaining, Math.min(80 * Math.pow(1.5, attempt), 400));
      attempt++;
      await waitForLeaseReleaseOrTimeout(backoff);
    }
  } else if (!(await acquireDurableLease())) {
    return null;
  }
  heartbeat = setInterval(() => {
    void renewDurableLease();
  }, Math.floor(LEASE_TTL_MS / 3));
  try {
    return await runOwned(work);
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    await releaseDurableLease();
  }
}
