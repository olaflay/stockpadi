import { getSupabase } from "@/lib/supabase";
import { db, type CustomerCreditMovement } from "@/lib/db";
import type { StockMovement } from "@/types/stock-movement";
import type { SaleRefund } from "@/types/sale-refund";
import { tenantGet, withLocalBusinessIds } from "@/lib/local-tenant";
import { serverPost } from "@/platform/api/backend-client";

export class RefundSaleError extends Error {}

export interface RefundItemParam {
  productId: string;
  quantity: number;
}

export interface RefundPaymentParam {
  method: "cash" | "transfer" | "pos_terminal" | "credit";
  amount: number;
}

export interface RefundSaleParams {
  /** Generated once for the refund intent and reused for retries. */
  clientRefundId: string;
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
  items: SaleRefund["items"];
  payments: SaleRefund["payments"];
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

  let response: RefundSaleResult;
  try {
    response = await serverPost("/api/sales/refund", {
      clientRefundId: params.clientRefundId,
      saleId: params.saleId,
      reason: params.reason.trim(),
      items: params.items.map(({ productId, quantity }) => ({ productId, quantity })),
      payments: params.payments,
    });
  } catch (error) {
    throw new RefundSaleError(
      error instanceof Error ? error.message : "Couldn't process refund. Please try again."
    );
  }
  if (!Array.isArray(response.items) || !Array.isArray(response.payments)) {
    throw new RefundSaleError("The server did not return an authoritative refund record. Nothing was mirrored locally.");
  }

  // Mirror the server's restocked items and credit adjustments locally
  const now = new Date().toISOString();

  await db.transaction("rw", db.stockMovements, db.customerCreditMovements, db.saleRefunds, async () => {
    // 1. Mirror restored stock
    if (params.items.length > 0) {
      const authoritativeItems = response.items;
      const movements: StockMovement[] = authoritativeItems.map((item, index) => ({
        id: `${response.refundId}:stock:${index}`,
        clientId: `${response.refundId}:stock:${index}`,
        branchId: params.branchId,
        productId: item.productId,
        quantityDelta: item.quantity,
        source: "sale_refund",
        sourceReferenceId: response.refundId || params.saleId,
        reasonCode: params.reason.trim(),
        createdAtLocal: now,
        createdAt: now,
        createdByUserId: session.user.id,
      }));
      await db.stockMovements.bulkAdd(await withLocalBusinessIds(movements));
    }

    // 2. Mirror customer credit reversal if customer was credited
    const authoritativePayments = response.payments;
    const creditPayment = authoritativePayments.find((p) => p.method === "credit");
    if (creditPayment && localSale.customerId) {
      const creditMovement: CustomerCreditMovement = {
        id: `${response.refundId}:credit`,
        clientId: `${response.refundId}:credit`,
        customerId: localSale.customerId,
        amountDelta: -creditPayment.amount,
        sourceReferenceId: response.refundId || params.saleId,
        createdAtLocal: now,
        createdByUserId: session.user.id,
      };
      await db.customerCreditMovements.put(
        (await withLocalBusinessIds([creditMovement]))[0]
      );
    }

    const refund: SaleRefund = {
      id: response.refundId,
      clientRefundId: params.clientRefundId,
      branchId: params.branchId,
      saleId: params.saleId,
      totalRefunded: response.totalRefunded,
      reason: params.reason.trim(),
      items: response.items,
      payments: response.payments,
      createdAt: now,
      createdAtLocal: now,
    };
    await db.saleRefunds.put((await withLocalBusinessIds([refund]))[0]);
  });

  return {
    status: "ok",
    refundId: response.refundId,
    totalRefunded: response.totalRefunded,
    restoredStock: response.restoredStock,
    items: response.items,
    payments: response.payments,
  };
}
