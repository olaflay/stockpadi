import { db } from "@/lib/db";
import type { Product } from "@/types/product";
import type { StockMovement } from "@/types/stock-movement";
import { enqueueOutboxWrite } from "@/features/sync/enqueue-outbox-write";
import { withLocalBusinessId } from "@/lib/local-tenant";

interface InitialStockInput {
  branchId: string;
  quantity: number;
  createdByUserId: string;
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
  initialStock: InitialStockInput | null
): Promise<void> {
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
    await db.transaction("rw", db.products, db.stockMovements, db.outbox, async () => {
      const tenantProduct = await withLocalBusinessId(productInput);
      const tenantMovement = await withLocalBusinessId(movement);
      const tenantPayload = await withLocalBusinessId(movementPayload);
      await db.products.add(tenantProduct);
      await db.stockMovements.add(tenantMovement);
      await enqueueOutboxWrite(productInput.id, "product", tenantProduct, now);
      await enqueueOutboxWrite(movementId, "stock_adjustment", tenantPayload, now);
    });
    return;
  }

  await db.transaction("rw", db.products, db.outbox, async () => {
    const tenantProduct = await withLocalBusinessId(productInput);
    await db.products.add(tenantProduct);
    await enqueueOutboxWrite(productInput.id, "product", tenantProduct, now);
  });
}

/**
 * The offline half of the product edit path. Upserts the local row (a product
 * created online and never synced down to this device would otherwise not
 * exist in IndexedDB, so a plain update would silently drop an offline edit),
 * tenant-stamps it, and queues the server merge through sync_apply_product.
 * Data + outbox in a single Dexie transaction.
 */
export async function writeProductEditOffline(id: string, update: Partial<Product>): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction("rw", db.products, db.outbox, async () => {
    const existing = await db.products.get(id);
    const payload = { id, ...update };
    const tenantPayload = await withLocalBusinessId(payload);
    if (existing) {
      await db.products.update(id, update);
    } else {
      await db.products.add({ ...tenantPayload, version: 1 } as Product);
    }
    await enqueueOutboxWrite(id, "product", tenantPayload, now);
  });
}
