import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { receivePurchase } from "@/features/purchases/receive-purchase";
import type { CurrentUser } from "@/features/auth/use-current-user";

const OWNER: CurrentUser = { id: "owner-1", fullName: "Owner", accountType: "BUSINESS_OWNER" };

describe("receivePurchase local-first sync contract", () => {
  beforeEach(async () => {
    await db.purchases.clear();
    await db.stockMovements.clear();
    await db.outbox.clear();
  });

  it("writes the purchase, ledger movements, and outbox item together", async () => {
    const purchase = await receivePurchase({
      branchId: "branch-1",
      supplierId: "supplier-1",
      lines: [{ productId: "product-1", quantity: 25, unitCost: 400 }],
      createdByUserId: OWNER.id,
      actor: OWNER,
    });

    expect(await db.purchases.get(purchase.id)).toMatchObject({ id: purchase.id, businessId: "test-business" });
    expect((await db.stockMovements.toArray()).filter((movement) => movement.sourceReferenceId === purchase.id)).toHaveLength(1);
    expect(await db.outbox.get(purchase.id)).toMatchObject({ type: "purchase_receipt", status: "pending", businessId: "test-business" });
  });

  it("accurately respects custom createdAtIso on purchase and ledger movements", async () => {
    const pastDate = "2026-09-20T14:15:00.000Z";
    const purchase = await receivePurchase({
      branchId: "branch-1",
      supplierId: "supplier-1",
      lines: [{ productId: "product-1", quantity: 10, unitCost: 500 }],
      createdByUserId: OWNER.id,
      actor: OWNER,
      createdAtIso: pastDate,
    });

    expect(purchase.createdAtLocal).toBe(pastDate);
    const savedPurchase = await db.purchases.get(purchase.id);
    expect(savedPurchase?.createdAtLocal).toBe(pastDate);

    const movements = (await db.stockMovements.toArray()).filter((m) => m.sourceReferenceId === purchase.id);
    expect(movements[0].createdAtLocal).toBe(pastDate);
  });
});
