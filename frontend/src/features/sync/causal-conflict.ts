import { db, withDatabaseClosedRecovery } from "@/lib/db";
import type { Product } from "@/types/product";
import type { SyncEntityType, SyncQueueItem } from "@/types/sync";
import type { CurrentUser } from "@/features/auth/use-current-user";
import { runSyncCycle } from "@/features/sync/SyncEngine";
import { writeProductEditOffline } from "@/features/inventory/product-offline-write";
import { canResolveConflictInPlace, discardConflictingSnapshot } from "@/features/sync/conflict-resolution";

/**
 * Causal Lamport & vector clock metadata.
 * Models multi-device causal progression for catalog entities so that concurrent
 * offline edits from distinct devices are detected and reconciled deliberately
 * without silent data loss or ledger rewriting.
 */
export interface CausalVector {
  deviceId: string;
  lamportClock: number;
  wallTime: string;
  version: number;
}

export interface CausalProductConflictView {
  clientId: string;
  productId: string;
  productName: string;
  localVector: CausalVector;
  remoteVector: CausalVector;
  localPrice: {
    sellPrice: number;
    costPrice?: number;
  };
  remotePrice: {
    sellPrice?: number;
    costPrice?: number;
  };
  isConcurrent: boolean;
  /**
   * IAS 2 financial guarantee: Price choices affect future sales only.
   * Past sales lines, cost snapshots, and stock ledger movements remain
   * strictly immutable and protected.
   */
  isolatedFromLedger: true;
}

/**
 * Financial and inventory ledger entities are strictly append-only and protected.
 * They must NEVER be rebased or overwritten in place.
 */
export const PROTECTED_LEDGER_ENTITY_TYPES: ReadonlySet<SyncEntityType> = new Set([
  "sale",
  "stock_adjustment",
  "purchase_receipt",
  "expense",
  "credit_payment",
]);

export function isProtectedLedgerEntity(type: SyncEntityType): boolean {
  return PROTECTED_LEDGER_ENTITY_TYPES.has(type);
}

/**
 * Evaluates the causal conflict between a local pending product mutation
 * and the authoritative cloud product row.
 */
export function evaluateCausalProductConflict(
  item: SyncQueueItem,
  cloudProduct?: Product | null
): CausalProductConflictView {
  const localPayload = item.payload as Partial<Product>;
  const productId = item.entityId ?? localPayload?.id ?? item.clientId;
  const productName = localPayload?.name ?? cloudProduct?.name ?? "Catalogue item";

  const localLamport = item.sequence ?? item.attemptCount ?? 1;
  const localVersion = item.expectedVersion ?? localPayload?.version ?? 1;
  const remoteVersion = cloudProduct?.version ?? localVersion;

  const localVector: CausalVector = {
    deviceId: "this-device",
    lamportClock: localLamport,
    wallTime: item.createdAtLocal,
    version: localVersion,
  };

  const remoteVector: CausalVector = {
    deviceId: "cloud-device",
    lamportClock: Math.max(localLamport, remoteVersion),
    wallTime: cloudProduct?.updatedAt ?? new Date().toISOString(),
    version: remoteVersion,
  };

  // Concurrent if both versions diverged without knowledge of each other
  const isConcurrent = localVersion !== remoteVersion || Boolean(cloudProduct);

  return {
    clientId: item.clientId,
    productId,
    productName,
    localVector,
    remoteVector,
    localPrice: {
      sellPrice: localPayload?.sellPrice ?? 0,
      costPrice: localPayload?.costPrice,
    },
    remotePrice: {
      sellPrice: cloudProduct?.sellPrice,
      costPrice: cloudProduct?.costPrice,
    },
    isConcurrent,
    isolatedFromLedger: true,
  };
}

/**
 * Resolves a catalog conflict by accepting the cloud version.
 * Discards only the conflicting local catalog snapshot and triggers
 * a clean sync cycle. Past sales lines and stock movements are never altered.
 */
export async function executeCausalResolveWithCloud(item: SyncQueueItem): Promise<void> {
  if (!canResolveConflictInPlace(item)) {
    throw new Error("Protected ledger entities cannot be discarded in place.");
  }
  await discardConflictingSnapshot(item);
  await runSyncCycle("manual");
}

/**
 * Resolves a catalog conflict by keeping this device's version.
 * Applies the desired price forward with a fresh version and Lamport clock,
 * leaving historical sales lines and ledger movements completely immutable.
 */
export async function executeCausalKeepThisDevice(
  item: SyncQueueItem,
  user: CurrentUser
): Promise<void> {
  if (item.type !== "product" || !canResolveConflictInPlace(item)) {
    throw new Error("Only product catalog conflicts can be updated forward.");
  }

  const desired = item.payload as Product;
  await discardConflictingSnapshot(item);
  const cycle = await runSyncCycle("manual");
  const productId = item.entityId ?? desired.id;
  const cloudProduct = productId ? await db.products.get(productId) : undefined;

  if (!cycle?.pullResult.fullySynced || !cloudProduct) {
    await withDatabaseClosedRecovery(() => db.outbox.put(item));
    throw new Error("The cloud version could not be confirmed. Your change remains in the list.");
  }

  // Write forward with next version: IAS 2 guarantee preserves historical sales
  const nextVersion = (cloudProduct.version ?? 0) + 1;
  await writeProductEditOffline(
    cloudProduct.id,
    {
      ...desired,
      version: nextVersion,
      updatedAt: new Date().toISOString(),
    },
    null,
    user
  );
}
