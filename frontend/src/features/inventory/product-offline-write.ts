import { db } from "@/lib/db";
import type { Product } from "@/types/product";
import type { StockMovement } from "@/types/stock-movement";
import { enqueueOutboxWrite } from "@/features/sync/enqueue-outbox-write";
import { withLocalBusinessId } from "@/lib/local-tenant";
import type { LocalCategory } from "@/lib/db";
import type { CurrentUser } from "@/features/auth/use-current-user";
import { assertCapability } from "@/features/auth/authorization";

interface InitialStockInput {
  branchId: string;
  quantity: number;
  createdByUserId: string;
}

function normalizedCategoryName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

/**
 * Resolve a newly typed category inside the same Dexie transaction as the
 * product write. The form already de-duplicates against its live query, but
 * this second check is the correctness boundary for two rapid/concurrent
 * writes (or a stale form query). The server has the matching case-insensitive
 * unique constraint; local state must obey the same invariant immediately.
 */
async function resolveCategoryWrite(category: LocalCategory | null): Promise<{
  id: string | null;
  row: (LocalCategory & { businessId: string }) | null;
}> {
  if (!category) return { id: null, row: null };

  const row = await withLocalBusinessId(category);
  const existing = (await db.categories.toArray()).find(
    (candidate) =>
      candidate.businessId === row.businessId &&
      normalizedCategoryName(candidate.name) === normalizedCategoryName(row.name),
  );

  return existing
    ? { id: existing.id, row: null }
    : { id: row.id, row };
}

/**
 * The offline half of the product create path. When the server can't be
 * reached the form hook falls through to this: land the product (and its
 * optional opening stock) in IndexedDB and queue the server merge through the
 * outbox, mirroring exactly what the online fast path runs (sync_apply_product
 * for the product, sync_apply_stock_adjustment for the starting stock). Data +
 * outbox in a single Dexie transaction, per
 * .agents/rules/offline-sync-and-ledger.md.
 */
export async function writeNewProductOffline(
  productInput: Product,
  initialStock: InitialStockInput | null,
  category: LocalCategory | null = null,
  actor: CurrentUser,
): Promise<void> {
  assertCapability(actor, "MANAGE_PRODUCTS");
  if (initialStock) assertCapability(actor, "ADJUST_STOCK");
  const now = new Date().toISOString();

  if (initialStock) {
    const movementId = crypto.randomUUID();
    const movement: StockMovement = {
      id: movementId,
      clientId: movementId,
      branchId: initialStock.branchId,
      productId: productInput.id,
      quantityDelta: initialStock.quantity,
      source: "initial_stock",
      sourceReferenceId: null,
      reasonCode: null,
      createdAtLocal: now,
      createdAt: now,
      createdByUserId: initialStock.createdByUserId,
    };
    const movementPayload = {
      id: movementId,
      clientId: movementId,
      branchId: initialStock.branchId,
      productId: productInput.id,
      quantityDelta: initialStock.quantity,
      reasonCode: "initial_stock" as const,
      note: null,
      createdAtLocal: now,
    };
    await db.transaction("rw", db.products, db.categories, db.stockMovements, db.outbox, async () => {
      const categoryWrite = await resolveCategoryWrite(category);
      const product = categoryWrite.id && productInput.categoryId !== categoryWrite.id
        ? { ...productInput, categoryId: categoryWrite.id }
        : productInput;
      if (categoryWrite.row) {
        await db.categories.put(categoryWrite.row);
        await enqueueOutboxWrite(categoryWrite.id!, "category", categoryWrite.row, now, { entityId: categoryWrite.id! });
      }
      const tenantProduct = await withLocalBusinessId(product);
      const tenantMovement = await withLocalBusinessId(movement);
      const tenantPayload = await withLocalBusinessId(movementPayload);
      await db.products.add(tenantProduct);
      await db.stockMovements.add(tenantMovement);
      await enqueueOutboxWrite(product.id, "product", tenantProduct, now, { entityId: product.id, dependsOn: categoryWrite.id ? [categoryWrite.id] : undefined });
      await enqueueOutboxWrite(movementId, "stock_adjustment", tenantPayload, now, { dependsOn: [initialStock.branchId, product.id] });
    });
    return;
  }

  await db.transaction("rw", db.products, db.categories, db.outbox, async () => {
    const categoryWrite = await resolveCategoryWrite(category);
    const product = categoryWrite.id && productInput.categoryId !== categoryWrite.id
      ? { ...productInput, categoryId: categoryWrite.id }
      : productInput;
    if (categoryWrite.row) {
      await db.categories.put(categoryWrite.row);
      await enqueueOutboxWrite(categoryWrite.id!, "category", categoryWrite.row, now, { entityId: categoryWrite.id! });
    }
    const tenantProduct = await withLocalBusinessId(product);
    await db.products.add(tenantProduct);
    await enqueueOutboxWrite(product.id, "product", tenantProduct, now, { entityId: product.id, dependsOn: categoryWrite.id ? [categoryWrite.id] : undefined });
  });
}

/**
 * The offline half of the product edit path. Upserts the local row (a product
 * created online and never synced down to this device would otherwise not
 * exist in IndexedDB, so a plain update would silently drop an offline edit),
 * tenant-stamps it, and queues the server merge through sync_apply_product.
 * Data + outbox in a single Dexie transaction.
 */
export async function writeProductEditOffline(id: string, update: Partial<Product>, category: LocalCategory | null = null, actor: CurrentUser): Promise<void> {
  assertCapability(actor, "MANAGE_PRODUCTS");
  const now = new Date().toISOString();
  await db.transaction("rw", db.products, db.categories, db.outbox, async () => {
    const existing = await db.products.get(id);
    // The server RPC accepts a complete canonical snapshot. Merging here is
    // what prevents a partial UI patch from turning omitted fields into NULL.
    const merged: Product = existing
      ? { ...existing, ...update, id, updatedAt: update.updatedAt ?? now }
      : {
          id,
          sku: update.sku ?? "",
          barcode: update.barcode ?? null,
          name: update.name ?? "Unnamed product",
          categoryId: update.categoryId ?? null,
          brandId: update.brandId ?? null,
          unitLabel: update.unitLabel ?? "piece",
          altUnitLabel: update.altUnitLabel ?? null,
          altUnitConversionFactor: update.altUnitConversionFactor ?? null,
          altUnitSellPrice: update.altUnitSellPrice ?? null,
          costPrice: update.costPrice ?? 0,
          sellPrice: update.sellPrice ?? 0,
          expiryTracking: update.expiryTracking ?? "off",
          expiryDate: update.expiryDate ?? null,
          lowStockThreshold: update.lowStockThreshold ?? null,
          archived: update.archived ?? false,
          version: update.version ?? 1,
          updatedAt: update.updatedAt ?? now,
        };
    const categoryWrite = await resolveCategoryWrite(category);
    const product = categoryWrite.id && merged.categoryId !== categoryWrite.id
      ? { ...merged, categoryId: categoryWrite.id }
      : merged;
    if (categoryWrite.row) {
      await db.categories.put(categoryWrite.row);
      await enqueueOutboxWrite(categoryWrite.id!, "category", categoryWrite.row, now, { entityId: categoryWrite.id! });
    }
    const tenantPayload = await withLocalBusinessId(product);
    if (existing) {
      await db.products.put(tenantPayload as Product);
    } else {
      await db.products.add({ ...tenantPayload, version: 1 } as Product);
    }
    await enqueueOutboxWrite(id, "product", tenantPayload, now, { entityId: id, dependsOn: categoryWrite.id ? [categoryWrite.id] : undefined });
  });
}
