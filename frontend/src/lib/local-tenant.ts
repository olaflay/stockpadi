import { db, BUSINESS_PROFILE_SINGLETON_ID, type SyncQuarantineRow } from "@/lib/db";

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
  if (profile?.businessId) {
    activeBusinessId = profile.businessId;
    return activeBusinessId;
  }
  // Fallback: check logged-in localUser
  try {
    const session = await db.session.get("current");
    if (session?.userId) {
      const user = await db.localUsers.get(session.userId);
      if (user?.businessId) {
        activeBusinessId = user.businessId;
        return activeBusinessId;
      }
    }
  } catch {
    // Ignore db read issues on startup
  }
  return undefined;
}

export async function setLocalBusinessId(businessId: string | null | undefined): Promise<void> {
  if (!businessId) return;
  activeBusinessId = businessId;
  const existing = await db.businessProfile.get(BUSINESS_PROFILE_SINGLETON_ID);
  if (existing) {
    await db.businessProfile.update(BUSINESS_PROFILE_SINGLETON_ID, { businessId });
  } else {
    await db.businessProfile.put({
      id: BUSINESS_PROFILE_SINGLETON_ID,
      businessId,
      name: "My Store",
      businessTypeId: "retail",
      currency: "NGN",
    });
  }
  // Legacy rows without a tenant are ambiguous. Never silently attach them to
  // whichever account happens to log in on this browser: retain them in the
  // recovery store and remove them from operational tables.
  const tables = [
    ["branches", db.branches], ["categories", db.categories], ["products", db.products],
    ["customers", db.customers], ["customerCreditMovements", db.customerCreditMovements],
    ["stockMovements", db.stockMovements], ["sales", db.sales], ["outbox", db.outbox],
    ["localUsers", db.localUsers], ["auditLogs", db.auditLogs], ["expenses", db.expenses],
    ["suppliers", db.suppliers], ["purchases", db.purchases], ["inventoryStock", db.inventoryStock],
  ] as const;
  await db.transaction("rw", [db.syncQuarantine, ...tables.map(([, table]) => table)], async () => {
    // A legacy sale can be repaired without guessing when its sale-sourced
    // stock movements all point to exactly one tenant. Preserve that durable
    // linkage; quarantine only when it is absent or contradictory.
    const legacySales = (await db.sales.toArray()).filter((row) => !(row as { businessId?: string }).businessId);
    for (const row of legacySales) {
      const sale = row as { id: string; businessId?: string };
      const linked = (await db.stockMovements.toArray()).filter((movement) => {
        const candidate = movement as { source?: string; sourceReferenceId?: string | null; businessId?: string };
        return candidate.source === "sale" && candidate.sourceReferenceId === sale.id && candidate.businessId;
      });
      const tenantIds = [...new Set(linked.map((movement) => (movement as { businessId: string }).businessId))];
      if (tenantIds.length === 1) {
        await db.sales.put({ ...row, businessId: tenantIds[0] });
      }
    }
    for (const [entity, table] of tables) {
      const legacyRows = (await table.toArray()).filter((row) => !(row as { businessId?: string }).businessId);
      for (const row of legacyRows) {
        const record = row as { id?: string; clientId?: string };
        const quarantine: SyncQuarantineRow = {
          id: `legacy-${entity}-${record.id ?? record.clientId ?? crypto.randomUUID()}`,
          businessId,
          entity,
          entityId: String(record.id ?? record.clientId ?? "unknown"),
          record,
          reason: "missing_business_id_ambiguous_legacy_record",
          createdAt: new Date().toISOString(),
        };
        await db.syncQuarantine.put(quarantine);
        const key = record.id ?? record.clientId;
        if (key) await table.delete(key);
      }
    }
  });
}

export async function withLocalBusinessId<T extends object>(row: T): Promise<T & { businessId: string }> {
  const businessId = await getLocalBusinessId();
  if (!businessId && !allowLegacyRowsForTests) throw new Error("A signed-in business context is required before writing local data.");
  return { ...row, businessId: businessId ?? "test-business" };
}

export async function withLocalBusinessIds<T extends object>(rows: T[]): Promise<Array<T & { businessId: string }>> {
  const businessId = await getLocalBusinessId();
  if (!businessId && !allowLegacyRowsForTests) throw new Error("A signed-in business context is required before writing local data.");
  return rows.map((row) => ({ ...row, businessId: businessId ?? "test-business" }));
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
  const businessId = await getLocalBusinessId();
  return businessId
    ? rows.filter((row) => isLocalTenantRow(row as T & { businessId?: string }, businessId))
    : (allowLegacyRowsForTests ? rows : []);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function tenantGet(table: { get: (id: string) => PromiseLike<unknown> }, id: string): Promise<any>;
export function tenantGet<T>(table: { get: (id: string) => PromiseLike<T | undefined> }, id: string): Promise<T | undefined>;
export async function tenantGet<T>(table: { get: (id: string) => PromiseLike<T | undefined> }, id: string): Promise<T | undefined> {
  const row = await table.get(id);
  const businessId = await getLocalBusinessId();
  if (!row) return undefined;
  return businessId
    ? (isLocalTenantRow(row as T & { businessId?: string }, businessId) ? row : undefined)
    : (allowLegacyRowsForTests ? row : undefined);
}
