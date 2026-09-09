import { db } from "@/lib/db";
import { getLocalBusinessId } from "@/lib/local-tenant";
import { serverGet } from "@/features/operations/server-client";
import type { LocalCustomer, LocalBranch, LocalCategory } from "@/lib/db";
import type { Product } from "@/types/product";
import type { Expense } from "@/types/expense";
import type { Purchase } from "@/types/purchase";
import type { Sale } from "@/types/sale";

let lastPreloadAt = 0;
const PRELOAD_THROTTLE_MS = 2 * 60 * 1000; // 2 minutes

interface ServerCustomerItem {
  id: string;
  name: string;
  phone: string | null;
  updated_at: string;
  balance: number;
}

/**
 * Background non-blocking session preloader.
 * Syncs remote database entities down into Dexie IndexedDB on session start/login
 * so that local queries remain instant (<5ms) while the device holds the latest
 * server state.
 */
export async function preloadSessionData(force = false): Promise<void> {
  if (typeof window === "undefined" || (typeof navigator !== "undefined" && !navigator.onLine)) {
    return;
  }

  const now = Date.now();
  if (!force && now - lastPreloadAt < PRELOAD_THROTTLE_MS) {
    return;
  }
  lastPreloadAt = now;

  const businessId = await getLocalBusinessId();
  if (!businessId) return;

  // Run in background without blocking the caller
  void (async () => {
    try {
      // 1. Sync Customers
      try {
        const res = await serverGet<{ customers: ServerCustomerItem[] }>("/api/customers");
        if (res?.customers && Array.isArray(res.customers)) {
          await db.transaction("rw", db.customers, db.customerCreditMovements, async () => {
            for (const c of res.customers) {
              await db.customers.put({
                id: c.id,
                businessId,
                name: c.name,
                phone: c.phone ?? null,
                updatedAt: c.updated_at,
              } as LocalCustomer);

              // If customer has a positive server balance but no local movements,
              // seed a baseline balance movement so the local ledger matches the server.
              if (c.balance > 0) {
                const existingMovements = await db.customerCreditMovements.where("customerId").equals(c.id).count();
                if (existingMovements === 0) {
                  await db.customerCreditMovements.put({
                    id: `preload-${c.id}`,
                    clientId: `preload-${c.id}`,
                    businessId,
                    customerId: c.id,
                    amountDelta: c.balance,
                    sourceReferenceId: null,
                    createdAtLocal: c.updated_at,
                    createdByUserId: "server-sync",
                  });
                }
              }
            }
          });
        }
      } catch {
        // Fail silently; offline or endpoint error does not block the user
      }

      // 2. Sync Branches
      try {
        const res = await serverGet<{ branches: Array<{ id: string; name: string }> }>("/api/businesses/branches");
        if (res?.branches && Array.isArray(res.branches)) {
          await db.branches.bulkPut(
            res.branches.map((b) => ({
              id: b.id,
              businessId,
              name: b.name,
            } as LocalBranch))
          );
        }
      } catch {
        // Fail silently
      }

      // 3. Sync Categories
      try {
        const res = await serverGet<{ categories: Array<{ id: string; name: string }> }>("/api/categories");
        if (res?.categories && Array.isArray(res.categories)) {
          await db.categories.bulkPut(
            res.categories.map((cat) => ({
              id: cat.id,
              businessId,
              name: cat.name,
            } as LocalCategory))
          );
        }
      } catch {
        // Fail silently
      }

      // 4. Sync Products
      try {
        const res = await serverGet<{ products: Array<Record<string, unknown>> }>("/api/products");
        if (res?.products && Array.isArray(res.products)) {
          await db.products.bulkPut(
            res.products.map((p) => ({
              id: p.id as string,
              businessId,
              name: p.name as string,
              sku: (p.sku as string) || "",
              barcode: (p.barcode as string) || null,
              categoryId: (p.category_id as string) || (p.categoryId as string) || null,
              brandId: (p.brand_id as string) || (p.brandId as string) || null,
              costPrice: Number(p.cost_price ?? p.costPrice ?? 0),
              sellPrice: Number(p.sell_price ?? p.sellPrice ?? 0),
              lowStockThreshold: p.low_stock_threshold !== undefined && p.low_stock_threshold !== null ? Number(p.low_stock_threshold) : null,
              unitLabel: (p.unit_label as string) || (p.unitLabel as string) || "piece",
              altUnitLabel: (p.alt_unit_label as string) || (p.altUnitLabel as string) || null,
              altUnitConversionFactor: p.alt_unit_conversion_factor ? Number(p.alt_unit_conversion_factor) : (p.units_per_alt ? Number(p.units_per_alt) : null),
              altUnitSellPrice: p.alt_unit_sell_price ? Number(p.alt_unit_sell_price) : null,
              expiryTracking: (p.expiry_tracking as Product["expiryTracking"]) || "off",
              expiryDate: (p.expiry_date as string) || null,
              archived: Boolean(p.archived),
              version: Number(p.version ?? 1),
              updatedAt: (p.updated_at as string) || new Date().toISOString(),
            } as Product))
          );
        }
      } catch {
        // Fail silently
      }

      // 5. Sync Expenses
      try {
        const res = await serverGet<{ expenses: Array<Record<string, unknown>> }>("/api/expenses");
        if (res?.expenses && Array.isArray(res.expenses)) {
          await db.expenses.bulkPut(
            res.expenses.map((e) => ({
              id: e.id as string,
              businessId,
              branchId: (e.branch_id as string) || (e.branchId as string) || null,
              category: (e.category as string) || "general",
              amount: Number(e.amount ?? 0),
              note: (e.note as string) || null,
              createdAtLocal: (e.created_at as string) || (e.createdAtLocal as string) || new Date().toISOString(),
              createdByUserId: (e.created_by_user_id as string) || (e.createdByUserId as string) || "server-sync",
            } as Expense))
          );
        }
      } catch {
        // Fail silently
      }

      // 6. Sync Purchases
      try {
        const res = await serverGet<{ purchases: Array<Record<string, unknown>> }>("/api/purchases");
        if (res?.purchases && Array.isArray(res.purchases)) {
          await db.purchases.bulkPut(
            res.purchases.map((p) => ({
              id: p.id as string,
              clientId: (p.client_id as string) || (p.clientId as string) || (p.id as string),
              businessId,
              branchId: (p.branch_id as string) || (p.branchId as string) || "",
              supplierId: (p.supplier_id as string) || (p.supplierId as string) || "",
              createdAtLocal: (p.created_at as string) || (p.createdAtLocal as string) || new Date().toISOString(),
              items: (p.items as Array<Record<string, unknown>> ?? []).map((i) => ({
                productId: (i.product_id as string) || (i.productId as string) || "",
                quantity: Number(i.quantity ?? 0),
                unitCost: Number(i.unit_cost ?? i.unitCost ?? 0),
              })),
            } as Purchase))
          );
        }
      } catch {
        // Fail silently
      }

      // 7. Sync Sales
      try {
        const res = await serverGet<{ sales: Array<Record<string, unknown>> }>("/api/sales");
        if (res?.sales && Array.isArray(res.sales)) {
          await db.sales.bulkPut(
            res.sales.map((s) => ({
              id: s.id as string,
              clientId: (s.client_id as string) || (s.clientId as string) || (s.id as string),
              businessId,
              branchId: (s.branch_id as string) || (s.branchId as string) || "",
              customerId: (s.customer_id as string) || (s.customerId as string) || null,
              subtotal: Number(s.subtotal ?? 0),
              discount: Number(s.discount ?? 0),
              total: Number(s.total ?? 0),
              payments: (s.payments as Array<{ method: string; amount: number; reference?: string }> ?? []).map((pm) => ({
                method: pm.method as Sale["payments"][0]["method"],
                amount: Number(pm.amount),
                reference: pm.reference,
              })),
              items: (s.items as Array<Record<string, unknown>> ?? []).map((it) => ({
                productId: (it.product_id as string) || (it.productId as string) || "",
                quantity: Number(it.quantity ?? 0),
                unitPrice: Number(it.unit_price ?? it.unitPrice ?? 0),
                discount: Number(it.discount ?? 0),
                unitLabel: (it.unit_label as string) || (it.unitLabel as string) || "piece",
                conversionFactor: Number(it.conversion_factor ?? it.conversionFactor ?? 1),
                movementClientId: (it.movement_client_id as string) || (it.movementClientId as string) || `sync-mvt-${s.id}`,
              })),
              createdAtLocal: (s.created_at_local as string) || (s.created_at as string) || new Date().toISOString(),
              createdAt: (s.created_at as string) || (s.createdAt as string) || new Date().toISOString(),
              createdByUserId: (s.created_by_user_id as string) || (s.createdByUserId as string) || "server-sync",
              voidedAt: (s.voided_at as string) || null,
            } as Sale))
          );
        }
      } catch {
        // Fail silently
      }
    } catch {
      // Overall safety catch
    }
  })();
}
