import { db, withDatabaseClosedRecovery } from "@/lib/db";
import { enqueueOutboxWrite } from "@/features/sync/enqueue-outbox-write";
import { withLocalBusinessId } from "@/lib/local-tenant";
import type { CurrentUser } from "@/features/auth/use-current-user";
import { assertCapability } from "@/features/auth/authorization";

/**
 * Deletes a category offline, unassigns it from any products, and enqueues an outbox row.
 * Preserves products without breaking catalog references.
 *
 * The queued payload carries the category's real name as well as its id.
 * `sync_apply_category` requires both, and rejects a nameless payload with
 * SQLSTATE 22023, which the sync pipeline classifies as a permanent
 * VALIDATION_ERROR — the row would never drain and the owner would see a
 * sync error they could not act on. The `deleted` flag is what tells the
 * server to remove the row rather than upsert it.
 */
export async function deleteCategoryOffline(categoryId: string, actor: CurrentUser): Promise<void> {
  assertCapability(actor, "MANAGE_PRODUCTS");

  await withDatabaseClosedRecovery(() => db.transaction("rw", db.categories, db.products, db.outbox, async () => {
    const existing = await db.categories.get(categoryId);
    if (!existing) return;

    // Capture the name before the row is removed — the server needs it to
    // authorise and apply the delete.
    const categoryName = existing.name;

    await db.categories.delete(categoryId);

    const affected = await db.products.where("categoryId").equals(categoryId).toArray();
    for (const prod of affected) {
      await db.products.update(prod.id, { categoryId: null });
    }

    const payload = await withLocalBusinessId({
      id: categoryId,
      name: categoryName,
      deleted: true,
    });

    await enqueueOutboxWrite(
      categoryId,
      "category",
      payload,
      new Date().toISOString(),
      { entityId: categoryId }
    );
  }));
}
