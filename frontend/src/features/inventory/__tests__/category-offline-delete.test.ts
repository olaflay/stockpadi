// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { deleteCategoryOffline } from "@/features/inventory/category-offline-delete";
import { enqueueOutboxWrite } from "@/features/sync/enqueue-outbox-write";
import type { CurrentUser } from "@/features/auth/use-current-user";

/**
 * Regression cover for the category delete sync failure.
 *
 * Deleting a category from the Add Product screen queued an outbox row with
 * the payload `{ id, deleted: true, isDeleted: true }`. The server function
 * `sync_apply_category` requires both `id` and `name` and raises SQLSTATE
 * 22023 ("Category id and name are required") otherwise, which the sync
 * pipeline classifies as a permanent VALIDATION_ERROR. The row never drained
 * and the owner saw a sync error on a screen where they had only deleted a
 * category.
 *
 * The server has no soft-delete column on `categories`, so a delete must
 * carry the category's real name and be applied as a real delete.
 */

const OWNER: CurrentUser = {
  id: "user-owner",
  fullName: "Owner",
  role: "owner",
  accountType: "BUSINESS_OWNER",
};

const CATEGORY_ID = "category-1";

async function seedCategory() {
  await db.categories.put({
    id: CATEGORY_ID,
    businessId: "test-business",
    name: "Drinks",
  });
}

describe("deleteCategoryOffline", () => {
  beforeEach(async () => {
    await db.categories.clear();
    await db.products.clear();
    await db.outbox.clear();
  });

  it("queues a category outbox row the server can accept", async () => {
    await seedCategory();

    await deleteCategoryOffline(CATEGORY_ID, OWNER);

    const queued = await db.outbox.toArray();
    const categoryWrite = queued.find((item) => item.type === "category");

    expect(categoryWrite).toBeDefined();

    const payload = categoryWrite!.payload as Record<string, unknown>;
    // sync_apply_category requires a name; a nameless payload is rejected
    // with SQLSTATE 22023 and never drains.
    expect(payload.name).toBe("Drinks");
    expect(payload.id).toBe(CATEGORY_ID);
  });

  it("marks the outbox row as a delete the server applies", async () => {
    await seedCategory();

    await deleteCategoryOffline(CATEGORY_ID, OWNER);

    const queued = await db.outbox.toArray();
    const categoryWrite = queued.find((item) => item.type === "category");
    const payload = categoryWrite!.payload as Record<string, unknown>;

    expect(payload.deleted).toBe(true);
  });

  it("removes the category locally", async () => {
    await seedCategory();

    await deleteCategoryOffline(CATEGORY_ID, OWNER);

    expect(await db.categories.get(CATEGORY_ID)).toBeUndefined();
  });

  it("uncategorizes products that referenced the deleted category", async () => {
    await seedCategory();
    await db.products.put({
      id: "product-1",
      businessId: "test-business",
      sku: "SKU-1",
      barcode: null,
      name: "Cola",
      categoryId: CATEGORY_ID,
      brandId: null,
      unitLabel: "piece",
      altUnitLabel: null,
      altUnitConversionFactor: null,
      altUnitSellPrice: null,
      costPrice: 100,
      sellPrice: 150,
      expiryTracking: "off",
      expiryDate: null,
      lowStockThreshold: null,
      version: 1,
      updatedAt: new Date().toISOString(),
    });

    await deleteCategoryOffline(CATEGORY_ID, OWNER);

    const product = await db.products.get("product-1");
    expect(product?.categoryId).toBeNull();
  });

  it("refuses to delete without the manage-products capability", async () => {
    await seedCategory();

    await expect(
      deleteCategoryOffline(CATEGORY_ID, { id: "w", fullName: "W", role: "cashier" })
    ).rejects.toThrow();

    // Nothing should have been queued or deleted.
    expect(await db.outbox.toArray()).toHaveLength(0);
    expect(await db.categories.get(CATEGORY_ID)).toBeDefined();
  });

  it("coalesces a delete over a still-pending create so the server is not asked to create then delete", async () => {
    await seedCategory();

    // A create for the same category is still queued (the category was made
    // offline and has not drained yet).
    await enqueueOutboxWrite(
      CATEGORY_ID,
      "category",
      { id: CATEGORY_ID, businessId: "test-business", name: "Drinks" },
      new Date().toISOString(),
      { entityId: CATEGORY_ID }
    );

    await deleteCategoryOffline(CATEGORY_ID, OWNER);

    const queued = await db.outbox.toArray();
    const categoryWrites = queued.filter((item) => item.type === "category");

    // Categories are a mutable entity type, so the delete replaces the
    // pending create in place rather than queueing a second mutation.
    expect(categoryWrites).toHaveLength(1);
    const payload = categoryWrites[0].payload as Record<string, unknown>;
    expect(payload.deleted).toBe(true);
    expect(payload.name).toBe("Drinks");
  });
});
