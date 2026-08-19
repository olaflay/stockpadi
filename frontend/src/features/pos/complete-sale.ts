import { db, type CustomerCreditMovement } from "@/lib/db";
import type { Sale, SaleItem, SalePayment } from "@/types/sale";
import type { StockMovement } from "@/types/stock-movement";
import type { Product } from "@/types/product";
import { getCurrentStock } from "@/features/inventory/stock";
import type { CurrentUser } from "@/features/auth/use-current-user";
import { enqueueOutboxWrite } from "@/features/sync/enqueue-outbox-write";
import { tenantGet, withLocalBusinessId } from "@/lib/local-tenant";

export interface CartLine {
  productId: string;
  /** Quantity in unitLabel terms (e.g. 2 cartons), not necessarily the product's base unit. */
  quantity: number;
  unitPrice: number;
  /** The unit this line is sold by — product.unitLabel or product.altUnitLabel. */
  unitLabel: string;
  /** How many of the product's base unit one unitLabel unit represents; 1 for the base unit. */
  conversionFactor: number;
}

/**
 * Local-first write: the sale and its stock movements land in IndexedDB
 * immediately (optimistic, so the next sale can start right away), and a
 * single outbox entry queues the sale for the server-side merge. client_id
 * doubles as the sale id and the sync idempotency key. See
 * .agents/rules/offline-sync-and-ledger.md and
 * .agents/rules/coding-standards-and-api.md.
 */
export async function completeSale(params: {
  branchId: string;
  customerId: string | null;
  payments: SalePayment[];
  lines: CartLine[];
  createdByUserId: string;
  actor: CurrentUser;
}): Promise<Sale> {
  const now = new Date().toISOString();
  const saleId = crypto.randomUUID();

  const items: SaleItem[] = params.lines.map((line) => ({
    productId: line.productId,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    discount: 0,
    unitLabel: line.unitLabel,
    conversionFactor: line.conversionFactor,
    movementClientId: crypto.randomUUID(),
  }));

  // Requested base-unit quantity per product — aggregated up front since the
  // same product could appear on more than one cart line. The actual
  // availability check runs inside the write transaction below, so it's
  // atomic with the stock-movement writes rather than a separate read that
  // a concurrent sale in another tab could race past.
  const requestedBaseQtyByProduct = new Map<string, number>();
  for (const item of items) {
    const baseQty = item.quantity * item.conversionFactor;
    requestedBaseQtyByProduct.set(item.productId, (requestedBaseQtyByProduct.get(item.productId) ?? 0) + baseQty);
  }

  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  const sale: Sale = {
    id: saleId,
    clientId: saleId,
    branchId: params.branchId,
    customerId: params.customerId,
    items,
    payments: params.payments,
    subtotal,
    discount: 0,
    total: subtotal,
    createdAtLocal: now,
    createdAt: now,
    createdByUserId: params.createdByUserId,
    voidedAt: null,
  };

  // Stock always moves in the product's base unit, regardless of which unit
  // was sold — one stock pool underneath. See finding 1.1-D in
  // docs/RESEARCH-AND-PLAN.md.
  const movements: StockMovement[] = items.map((item) => ({
    id: crypto.randomUUID(),
    clientId: item.movementClientId,
    branchId: params.branchId,
    productId: item.productId,
    quantityDelta: -(item.quantity * item.conversionFactor),
    source: "sale",
    sourceReferenceId: saleId,
    reasonCode: null,
    createdAtLocal: now,
    createdAt: now,
    createdByUserId: params.createdByUserId,
  }));

  // A sale can be split across payment methods (finding 1.1-A in
  // docs/RESEARCH-AND-PLAN.md — the most-endorsed complaint found
  // researching this product). Only the credit-tagged portion is owed by
  // the customer, not the sale's full total. The balance is always computed
  // from customerCreditMovements, never a stored total, per
  // .agents/rules/offline-sync-and-ledger.md. Reuses the sale's own clientId
  // as the movement's clientId since there is exactly one of these per sale,
  // mirroring how the server derives it from the synced sale record.
  const creditAmount = params.payments
    .filter((payment) => payment.method === "credit")
    .reduce((sum, payment) => sum + payment.amount, 0);

  if (creditAmount > 0 && !params.customerId) {
    // Never let a credit-tagged amount become debt owed by nobody — the
    // exact bug this file was rewritten to close. The UI must enforce this
    // before calling completeSale; this is the backstop.
    throw new Error("A credit payment requires a customer to be recorded.");
  }

  const creditMovement: CustomerCreditMovement | null =
    creditAmount > 0 && params.customerId
      ? {
          id: crypto.randomUUID(),
          clientId: saleId,
          customerId: params.customerId,
          amountDelta: creditAmount,
          sourceReferenceId: saleId,
          createdAtLocal: now,
          createdByUserId: params.createdByUserId,
        }
      : null;

  const [tenantSale, tenantMovements, tenantCreditMovement] = await Promise.all([
    withLocalBusinessId(sale),
    Promise.all(movements.map((movement) => withLocalBusinessId(movement))),
    creditMovement ? withLocalBusinessId(creditMovement) : Promise.resolve(null),
  ]);

  await db.transaction(
    "rw",
    db.sales,
    db.stockMovements,
    db.customerCreditMovements,
    db.outbox,
    db.products,
    async () => {
      // A sale must never silently drive stock negative — see
      // .agents/rules/offline-sync-and-ledger.md. Checked inside this
      // transaction so it's atomic with the writes below.
      for (const [productId, requested] of requestedBaseQtyByProduct) {
        const currentStock = await getCurrentStock(productId, params.branchId);
        if (requested > currentStock) {
          const product = await tenantGet<Product>(db.products, productId);
          throw new Error(
            `Not enough stock for ${product?.name ?? "this product"} — ${currentStock} available, ${requested} requested.`
          );
        }
      }

      await db.sales.add(tenantSale);
      await db.stockMovements.bulkAdd(tenantMovements);
      if (tenantCreditMovement) {
        await db.customerCreditMovements.add(tenantCreditMovement);
      }
      await enqueueOutboxWrite(saleId, "sale", tenantSale, now);
    }
  );

  return sale;
}
