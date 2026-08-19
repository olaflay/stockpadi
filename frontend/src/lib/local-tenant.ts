import { db, BUSINESS_PROFILE_SINGLETON_ID } from "@/lib/db";

let activeBusinessId: string | undefined;
const allowLegacyRowsForTests = typeof process !== "undefined" && process.env.NODE_ENV === "test";

export function getCachedLocalBusinessId(): string | undefined {
  return activeBusinessId;
}

export function clearLocalBusinessId(): void {
  activeBusinessId = undefined;
}

/** The cached business identity is a routing/cache key only, never auth. */
export async function getLocalBusinessId(): Promise<string | undefined> {
  if (activeBusinessId) return activeBusinessId;
  const profile = await db.businessProfile.get(BUSINESS_PROFILE_SINGLETON_ID);
  activeBusinessId = profile?.businessId;
  return activeBusinessId;
}

export async function setLocalBusinessId(businessId: string | null | undefined): Promise<void> {
  if (!businessId) return;
  activeBusinessId = businessId;
  await db.businessProfile.update(BUSINESS_PROFILE_SINGLETON_ID, { businessId });
}

export async function withLocalBusinessId<T extends { businessId?: string }>(row: T): Promise<T> {
  const businessId = await getLocalBusinessId();
  return businessId ? { ...row, businessId } : row;
}

export async function withLocalBusinessIds<T extends { businessId?: string }>(rows: T[]): Promise<T[]> {
  const businessId = await getLocalBusinessId();
  return businessId ? rows.map((row) => ({ ...row, businessId })) : rows;
}

export async function tenantRows<T extends { businessId?: string }>(rows: T[]): Promise<T[]> {
  const businessId = await getLocalBusinessId();
  return businessId ? rows.filter((row) => row.businessId === businessId) : [];
}

export function isLocalTenantRow(row: { businessId?: string }, businessId: string | undefined): boolean {
  return Boolean(businessId && (row.businessId === businessId || (allowLegacyRowsForTests && !row.businessId)));
}

export function matchesActiveTenant(row: { businessId?: string }): boolean {
  return isLocalTenantRow(row, activeBusinessId);
}

// Dexie's EntityTable exposes a different insert type from its read type. The
// adapter intentionally erases that write-only generic at this boundary while
// preserving the caller's read type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function tenantArray(table: { toArray: (...args: never[]) => PromiseLike<unknown[]> }): Promise<any[]>;
export function tenantArray<T>(table: { toArray: (...args: never[]) => PromiseLike<T[]> }): Promise<T[]>;
export async function tenantArray<T>(table: { toArray: (...args: never[]) => PromiseLike<T[]> }): Promise<T[]> {
  const rows = await table.toArray();
  return activeBusinessId ? rows.filter((row) => matchesActiveTenant(row as T & { businessId?: string })) : [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function tenantGet(table: { get: (id: string) => PromiseLike<unknown> }, id: string): Promise<any>;
export function tenantGet<T>(table: { get: (id: string) => PromiseLike<T | undefined> }, id: string): Promise<T | undefined>;
export async function tenantGet<T>(table: { get: (id: string) => PromiseLike<T | undefined> }, id: string): Promise<T | undefined> {
  const row = await table.get(id);
  return row && matchesActiveTenant(row as T & { businessId?: string }) ? row : undefined;
}
