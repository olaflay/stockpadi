import { db } from "@/lib/db";
import { enqueueOutboxWrite } from "@/features/sync/enqueue-outbox-write";
import type { CurrentUser } from "@/features/auth/use-current-user";
import { assertCapability } from "@/features/auth/authorization";

/**
 * Deletes a category offline, unassigns it from any products, and enqueues an outbox row.
 * Preserves products without breaking catalog references.
 */
export async function deleteCategoryOffline(categoryId: string, actor: CurrentUser): Promise<void> {
  assertCapability(actor, "MANAGE_PRODUCTS");

  await db.transaction("rw", db.categories, db.products, db.outbox, async () => {
    const existing = await db.categories.get(categoryId);
    if (!existing) return;

    await db.categories.delete(categoryId);

    const affected = await db.products.where("categoryId").equals(categoryId).toArray();
    for (const prod of affected) {
      await db.products.update(prod.id, { categoryId: null });
    }

    await enqueueOutboxWrite(
      categoryId,
      "category",
      { id: categoryId, deleted: true, isDeleted: true },
      new Date().toISOString(),
      { entityId: categoryId }
    );
  });
}
