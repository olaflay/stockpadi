import { db } from "@/lib/db";
import { getLocalBusinessId } from "@/lib/local-tenant";

const LEASE_ID = "global-sync";
const LEASE_TTL_MS = 45_000;

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

  return db.transaction("rw", db.syncLeases, async () => {
    const current = await db.syncLeases.get(LEASE_ID);
    if (current && current.ownerId !== currentOwnerId && current.expiresAt > acquiredAt) return false;
    await db.syncLeases.put({ id: LEASE_ID, businessId, ownerId: currentOwnerId, acquiredAt, expiresAt });
    return true;
  });
}

async function renewDurableLease(): Promise<void> {
  const currentOwnerId = getOwnerId();
  const expiresAt = new Date(Date.now() + LEASE_TTL_MS).toISOString();
  await db.transaction("rw", db.syncLeases, async () => {
    const current = await db.syncLeases.get(LEASE_ID);
    if (current?.ownerId === currentOwnerId) await db.syncLeases.update(LEASE_ID, { expiresAt });
  });
}

async function releaseDurableLease(): Promise<void> {
  const currentOwnerId = getOwnerId();
  await db.transaction("rw", db.syncLeases, async () => {
    const current = await db.syncLeases.get(LEASE_ID);
    if (current?.ownerId === currentOwnerId) await db.syncLeases.delete(LEASE_ID);
  });
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
export async function withSyncLease<T>(work: () => Promise<T>): Promise<T | null> {
  if (leaseDepth > 0) return runOwned(work);

  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request("stockpadi-sync-coordinator", { ifAvailable: true }, async (lock) => {
      if (!lock) return null;
      return runOwned(work);
    });
  }

  if (!(await acquireDurableLease())) return null;
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
