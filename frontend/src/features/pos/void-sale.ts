import { getSupabase } from "@/lib/supabase";
import { db, type CustomerCreditMovement } from "@/lib/db";
import type { StockMovement } from "@/types/stock-movement";
import { tenantArray, tenantGet, withLocalBusinessIds } from "@/lib/local-tenant";

/**
 * Thin client for the void-sale Edge Function. Online-required by locked
 * decision (.agents/rules/payment-and-pci-scope.md item 4) — this does NOT
 * go through the outbox like every other write in this app. The server is
 * the source of truth: local IndexedDB is only updated after it confirms
 * success, mirroring src/features/auth/manage-staff-client.ts's pattern.
 */

export class VoidSaleError extends Error {}

export async function voidSale(params: { saleId: string; branchId: string; reason?: string }): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new VoidSaleError("This device isn't connected to a server yet.");

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new VoidSaleError("Your session has expired. Sign in again.");

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "");
  if (!backendUrl && process.env.NODE_ENV !== "test") throw new VoidSaleError("The application backend is not configured.");
  const url = `${backendUrl ?? "http://backend.test"}/api/sales/void`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ saleId: params.saleId, reason: params.reason }),
  });

  const json = await response.json();
  if (!response.ok) {
    throw new VoidSaleError(json?.error?.message ?? "Couldn't void this sale. Try again.");
  }

  // Mirror the server's result locally so the receipt screen and stock
  // figures update immediately without waiting for the next sync cycle —
  // same reasoning as manage-staff-client.ts's local audit-log mirror.
  const now = new Date().toISOString();
  const originalMovements = await tenantArray(db.stockMovements
    .filter((m) => m.sourceReferenceId === params.saleId && m.source === "sale")
  );

  const originalCreditMovements = await tenantArray(db.customerCreditMovements
    .filter((m) => m.sourceReferenceId === params.saleId)
  );
  if (!(await tenantGet(db.sales, params.saleId))) throw new VoidSaleError("Sale does not belong to the active business.");

  await db.transaction("rw", db.sales, db.stockMovements, db.customerCreditMovements, async () => {
    await db.sales.update(params.saleId, { voidedAt: now });
    if (originalMovements.length > 0) {
      const reversals: StockMovement[] = originalMovements.map((m) => ({
        id: crypto.randomUUID(),
        clientId: crypto.randomUUID(),
        branchId: params.branchId,
        productId: m.productId,
        quantityDelta: -m.quantityDelta,
        source: "sale_void",
        sourceReferenceId: params.saleId,
        reasonCode: null,
        createdAtLocal: now,
        createdAt: now,
        createdByUserId: session.user.id,
      }));
      await db.stockMovements.bulkAdd(await withLocalBusinessIds(reversals));
    }
    if (originalCreditMovements.length > 0) {
      const creditReversals: CustomerCreditMovement[] = originalCreditMovements.map((m) => ({
        id: crypto.randomUUID(),
        clientId: crypto.randomUUID(),
        customerId: m.customerId,
        amountDelta: -m.amountDelta,
        sourceReferenceId: params.saleId,
        createdAtLocal: now,
        createdByUserId: session.user.id,
      }));
      await db.customerCreditMovements.bulkAdd(await withLocalBusinessIds(creditReversals));
    }
  });
}
