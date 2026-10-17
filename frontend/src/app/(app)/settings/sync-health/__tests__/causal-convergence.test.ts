// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { Product } from "@/types/product";
import type { Sale } from "@/types/sale";
import type { StockMovement } from "@/types/stock-movement";
import type { SyncQueueItem } from "@/types/sync";
import {
  canResolveConflictInPlace,
  discardConflictingSnapshot,
} from "@/features/sync/conflict-resolution";
import {
  evaluateCausalProductConflict,
  isProtectedLedgerEntity,
} from "@/features/sync/causal-conflict";
import {
  quarantinePoisonPill,
  getQuarantinedItems,
  retryQuarantinedItem,
} from "@/features/sync/outbox-quarantine";

describe("Causal Convergence & Ledger Invariance Engine", () => {
  beforeEach(async () => {
    await db.outbox.clear();
    await db.products.clear();
    await db.inventoryStock.clear();
    await db.stockMovements.clear();
    await db.sales.clear();
    await db.syncPullState.clear();
    await db.syncQuarantine.clear();
  });

  describe("1. Multi-Device Causal Convergence & IAS 2 Financial Protection", () => {
    it("converges offline catalog edits while strictly protecting historical sales lines and stock movements", async () => {
      const initialProduct: Product = {
        id: "prod-milo-1",
        businessId: "biz-1",
        sku: "MILO-500",
        barcode: null,
        name: "Milo 500g",
        categoryId: null,
        brandId: null,
        unitLabel: "piece",
        altUnitLabel: null,
        altUnitConversionFactor: null,
        altUnitSellPrice: null,
        sellPrice: 2500,
        costPrice: 2000,
        expiryTracking: "off",
        expiryDate: null,
        lowStockThreshold: 5,
        version: 1,
        updatedAt: "2026-10-17T08:00:00.000Z",
      };
      await db.products.put(initialProduct);

      await db.inventoryStock.put({
        id: "biz-1:prod-milo-1:branch-1",
        businessId: "biz-1",
        productId: "prod-milo-1",
        branchId: "branch-1",
        quantity: 20,
        updatedAt: "2026-10-17T08:00:00.000Z",
      });

      // Device 1 (Worker POS): Sells 2 units offline at initial price (2,500)
      const historicalSale: Sale = {
        id: "sale-offline-1",
        businessId: "biz-1",
        clientId: "sale-offline-1",
        branchId: "branch-1",
        customerId: null,
        subtotal: 5000,
        discount: 0,
        total: 5000,
        payments: [{ method: "cash", amount: 5000 }],
        items: [
          {
            productId: "prod-milo-1",
            quantity: 2,
            unitPrice: 2500,
            discount: 0,
            unitCost: 2000, // Snapshotted immutably per IAS 2
            unitLabel: "piece",
            conversionFactor: 1,
            movementClientId: "mov-offline-1",
          },
        ],
        createdAtLocal: "2026-10-17T08:15:00.000Z",
        createdAt: "2026-10-17T08:15:00.000Z",
        createdByUserId: "worker-1",
        voidedAt: null,
      };
      await db.sales.put(historicalSale);

      const movement: StockMovement = {
        id: "mov-offline-1",
        businessId: "biz-1",
        clientId: "mov-offline-1",
        branchId: "branch-1",
        productId: "prod-milo-1",
        quantityDelta: -2,
        source: "sale",
        sourceReferenceId: "sale-offline-1",
        reasonCode: null,
        createdAtLocal: "2026-10-17T08:15:00.000Z",
        createdAt: "2026-10-17T08:15:00.000Z",
        createdByUserId: "worker-1",
      };
      await db.stockMovements.put(movement);

      // Local inventory stock is updated from 20 to 18
      await db.inventoryStock.update("biz-1:prod-milo-1:branch-1", {
        quantity: 18,
        updatedAt: "2026-10-17T08:15:00.000Z",
      });

      // Device 2 (Owner Phone): Simultaneously edits product price offline to 2,800
      const ownerConflictMutation: SyncQueueItem<Product> = {
        clientId: "mut-product-edit-1",
        businessId: "biz-1",
        type: "product",
        operation: "upsert",
        status: "conflict",
        attemptCount: 1,
        lastError: "Version conflict with cloud update",
        createdAtLocal: "2026-10-17T08:20:00.000Z",
        entityId: "prod-milo-1",
        payload: {
          ...initialProduct,
          sellPrice: 2800,
          costPrice: 2100,
          version: 1,
        },
      };
      await db.outbox.put(ownerConflictMutation);

      // Cloud state has authoritative remote product (version 2)
      const cloudProduct: Product = {
        ...initialProduct,
        sellPrice: 2700,
        costPrice: 2050,
        version: 2,
        updatedAt: "2026-10-17T08:25:00.000Z",
      };

      // Evaluate Causal Conflict
      const causalConflict = evaluateCausalProductConflict(ownerConflictMutation, cloudProduct);
      expect(causalConflict.isConcurrent).toBe(true);
      expect(causalConflict.isolatedFromLedger).toBe(true);
      expect(causalConflict.localPrice.sellPrice).toBe(2800);
      expect(causalConflict.remotePrice.sellPrice).toBe(2700);

      // Resolve: Owner chooses to accept cloud price
      expect(canResolveConflictInPlace(ownerConflictMutation)).toBe(true);
      await discardConflictingSnapshot(ownerConflictMutation);
      await db.products.put(cloudProduct);

      // VERIFY INVARIANTS:
      // 1. Conflict mutation is removed from outbox
      expect(await db.outbox.get("mut-product-edit-1")).toBeUndefined();

      // 2. Future price is updated
      const updatedProduct = await db.products.get("prod-milo-1");
      expect(updatedProduct?.sellPrice).toBe(2700);

      // 3. IAS 2 FINANCIAL GUARANTEE: Historical sale line snapshot remains intact!
      const preservedSale = await db.sales.get("sale-offline-1");
      expect(preservedSale?.items[0].unitPrice).toBe(2500); // NEVER rebased to 2,700 or 2,800
      expect(preservedSale?.items[0].unitCost).toBe(2000); // NEVER rebased

      // 4. STOCK CONSERVATION INVARIANT: Zero phantom stock, stock is 18
      const preservedStock = await db.inventoryStock.get("biz-1:prod-milo-1:branch-1");
      expect(preservedStock?.quantity).toBe(18);

      const movements = await db.stockMovements.toArray();
      const movementSum = movements.reduce((sum, m) => sum + m.quantityDelta, 0);
      expect(movementSum).toBe(-2);
      expect(20 + movementSum).toBe(18); // Mathematical conservation: 20 baseline + (-2 delta) == 18 current
    });

    it("strictly blocks destructive in-place reconciliation for financial ledger movements", async () => {
      const saleMutation: SyncQueueItem = {
        clientId: "mut-sale-999",
        businessId: "biz-1",
        type: "sale",
        operation: "append",
        status: "conflict",
        attemptCount: 1,
        lastError: "Conflict",
        createdAtLocal: "2026-10-17T08:30:00.000Z",
        payload: { id: "sale-999", total: 10000 },
      };

      const stockAdjustmentMutation: SyncQueueItem = {
        clientId: "mut-adj-999",
        businessId: "biz-1",
        type: "stock_adjustment",
        operation: "append",
        status: "conflict",
        attemptCount: 1,
        lastError: "Conflict",
        createdAtLocal: "2026-10-17T08:30:00.000Z",
        payload: { id: "adj-999", quantityDelta: 5 },
      };

      expect(isProtectedLedgerEntity("sale")).toBe(true);
      expect(isProtectedLedgerEntity("stock_adjustment")).toBe(true);
      expect(isProtectedLedgerEntity("product")).toBe(false);

      expect(canResolveConflictInPlace(saleMutation)).toBe(false);
      expect(canResolveConflictInPlace(stockAdjustmentMutation)).toBe(false);

      // Attempting to discard a protected financial record throws an error
      await expect(discardConflictingSnapshot(saleMutation)).rejects.toThrow();
    });
  });

  describe("2. Non-Blocking Outbox Head-of-Line Quarantine & Self-Healing", () => {
    it("quarantines a poison-pill mutation so independent sales continue backing up without head-of-line blocking", async () => {
      const poisonPill: SyncQueueItem = {
        clientId: "poison-pill-1",
        businessId: "biz-1",
        type: "product",
        operation: "upsert",
        status: "failed",
        attemptCount: 8,
        lastError: "Invalid payload schema from third-party corruption",
        createdAtLocal: "2026-10-17T08:00:00.000Z",
        payload: { corrupted: true },
      };

      const legitimateSale: SyncQueueItem = {
        clientId: "legit-sale-1",
        businessId: "biz-1",
        type: "sale",
        operation: "append",
        status: "pending",
        attemptCount: 0,
        lastError: null,
        createdAtLocal: "2026-10-17T08:05:00.000Z",
        payload: { id: "sale-1", total: 4500 },
      };

      await db.outbox.put(poisonPill);
      await db.outbox.put(legitimateSale);

      // Quarantine the poison pill
      await quarantinePoisonPill(poisonPill, "Malformed payload quarantined to unblock outbox");

      // Verify it was moved to syncQuarantine and status changed to needs_review
      const quarantinedList = await getQuarantinedItems("biz-1");
      expect(quarantinedList.length).toBe(1);
      expect(quarantinedList[0].clientId).toBe("poison-pill-1");
      expect(quarantinedList[0].reason).toContain("Malformed payload quarantined");

      const updatedPoisonPill = await db.outbox.get("poison-pill-1");
      expect(updatedPoisonPill?.status).toBe("needs_review");

      // Verify that the outbox drain query (which only selects pending and blocked)
      // successfully excludes the poison pill while immediately including the legitimate sale!
      const readyForDrain = (await db.outbox.where("status").anyOf("pending", "blocked").toArray())
        .filter((item) => item.businessId === "biz-1");

      expect(readyForDrain.length).toBe(1);
      expect(readyForDrain[0].clientId).toBe("legit-sale-1");

      // Manual retry restores item to pending
      await retryQuarantinedItem("poison-pill-1");
      const restored = await db.outbox.get("poison-pill-1");
      expect(restored?.status).toBe("pending");
      expect(restored?.attemptCount).toBe(0);
      expect(await db.syncQuarantine.count()).toBe(0);
    });
  });
});
