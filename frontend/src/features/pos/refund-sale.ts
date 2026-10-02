import { getSupabase } from "@/lib/supabase";
import { db, type CustomerCreditMovement } from "@/lib/db";
import type { StockMovement } from "@/types/stock-movement";
import { tenantGet, withLocalBusinessIds } from "@/lib/local-tenant";
import { serverPost } from "@/features/operations/server-client";

export class RefundSaleError extends Error {}

export interface RefundItemParam {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export interface RefundPaymentParam {
  method: "cash" | "transfer" | "pos_terminal" | "credit";
  amount: number;
}

export interface RefundSaleParams {
  saleId: string;
  branchId: string;
  reason: string;
  items: RefundItemParam[];
  payments: RefundPaymentParam[];
}

export interface RefundSaleResult {
  status: "ok";
  refundId: string;
  totalRefunded: number;
  restoredStock: number;
}

/**
 * Client for online refund processing.
 *
 * Online-required by locked decision (.agents/rules/payment-and-pci-scope.md item 4).
 * This does NOT go through the offline outbox because returning customer money
 * requires an authoritative server ledger update.
 *
 * Local IndexedDB is updated immediately upon confirmed server success.
 */
export async function refundSale(params: RefundSaleParams): Promise<RefundSaleResult> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new RefundSaleError("This device isn't connected to a server yet.");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    throw new RefundSaleError("Your session has expired. Sign in again.");
  }

  if (!params.reason || !params.reason.trim()) {
    throw new RefundSaleError("A reason is required to process a refund.");
  }

  if (!params.items || params.items.length === 0) {
    throw new RefundSaleError("At least one item must be selected for refund.");
  }

  if (!params.payments || params.payments.length === 0) {
    throw new RefundSaleError("At least one refund payment method is required.");
  }

  const localSale = await tenantGet(db.sales, params.saleId);
  if (!localSale) {
    throw new RefundSaleError("Sale does not belong to the active business.");
  }

  let response: { status: string; refundId: string; totalRefunded: number; restoredStock: number };
  try {
    response = await serverPost("/api/sales/refund", {
      saleId: params.saleId,
      reason: params.reason.trim(),
      items: params.items,
      payments: params.payments,
    });
  } catch (error) {
    throw new RefundSaleError(
      error instanceof Error ? error.message : "Couldn't process refund. Please try again."
    );
  }

  // Mirror the server's restocked items and credit adjustments locally
  const now = new Date().toISOString();

  await db.transaction("rw", db.stockMovements, db.customerCreditMovements, async () => {
    // 1. Mirror restored stock
    if (params.items.length > 0) {
      const movements: StockMovement[] = params.items.map((item) => ({
        id: crypto.randomUUID(),
        clientId: crypto.randomUUID(),
        branchId: params.branchId,
        productId: item.productId,
        quantityDelta: item.quantity,
        source: "sale_refund" as unknown as StockMovement["source"],
        sourceReferenceId: response.refundId || params.saleId,
        reasonCode: params.reason.trim(),
        createdAtLocal: now,
        createdAt: now,
        createdByUserId: session.user.id,
      }));
      await db.stockMovements.bulkAdd(await withLocalBusinessIds(movements));
    }

    // 2. Mirror customer credit reversal if customer was credited
    const creditPayment = params.payments.find((p) => p.method === "credit");
    if (creditPayment && localSale.customerId) {
      const creditMovement: CustomerCreditMovement = {
        id: crypto.randomUUID(),
        clientId: crypto.randomUUID(),
        customerId: localSale.customerId,
        amountDelta: -creditPayment.amount,
        sourceReferenceId: response.refundId || params.saleId,
        createdAtLocal: now,
        createdByUserId: session.user.id,
      };
      await db.customerCreditMovements.add(
        (await withLocalBusinessIds([creditMovement]))[0]
      );
    }
  });

  return {
    status: "ok",
    refundId: response.refundId,
    totalRefunded: response.totalRefunded,
    restoredStock: response.restoredStock,
  };
}
