import { db, type CustomerCreditMovement } from "@/lib/db";
import type { CurrentUser } from "@/features/auth/use-current-user";
import { getCustomerCreditBalance } from "@/features/customers/credit";
import { enqueueOutboxWrite } from "@/features/sync/enqueue-outbox-write";
import { getSupabase } from "@/lib/supabase";
import { withLocalBusinessId } from "@/lib/local-tenant";

/**
 * No dedicated PermissionAction exists for this (see the class comment
 * Authorization is performed by sync-push/RLS when the outbox entry reaches
 * the server; this local function only records the offline intent.
 */

export interface CreditPaymentPayload {
  businessId?: string;
  id: string;
  clientId: string;
  customerId: string;
  amount: number;
  note: string | null;
  createdAtLocal: string;
}

/**
 * A payment against a customer's debt is a new negative credit movement,
 * never an update to a stored balance, per
 * .agents/rules/offline-sync-and-ledger.md — getCustomerCreditBalance sums
 * the ledger every time. Allowed offline, same reasoning as the credit sale
 * itself: no server round trip is needed to record it. Mirrors
 * completeSale's single-transaction, data-plus-outbox write shape.
 *
 * No dedicated permission action exists for this in
 * src/types/permissions.ts (it isn't a row in the PRD Section 14 matrix);
 * the roles allowed to record a payment match the
 * customer_credit_movements_insert RLS policy (owner, manager, cashier,
 * accountant, admin), enforced server-side — see
 * supabase/migrations/20260807054734_rls_policies.sql.
 */
export async function recordCreditPayment(params: {
  customerId: string;
  amount: number;
  note: string | null;
  createdByUserId: string;
  actor: CurrentUser;
}): Promise<CustomerCreditMovement> {
  if (params.amount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  // Guard against an accidental extra zero — not a hard cap on legitimate
  // overpayment, just a sanity check against a payment wildly larger than
  // what's actually owed.
  const currentBalance = await getCustomerCreditBalance(params.customerId);
  if (currentBalance > 0 && params.amount > currentBalance * 2) {
    throw new Error(
      `That's more than double the ₦${currentBalance.toLocaleString()} owed — double-check the amount before saving.`
    );
  }

  const now = new Date().toISOString();
  const movementId = crypto.randomUUID();

  const movement: CustomerCreditMovement = {
    id: movementId,
    clientId: movementId,
    customerId: params.customerId,
    amountDelta: -params.amount,
    sourceReferenceId: movementId,
    createdAtLocal: now,
    createdByUserId: params.createdByUserId,
  };

  const payload: CreditPaymentPayload = {
    id: movementId,
    clientId: movementId,
    customerId: params.customerId,
    amount: params.amount,
    note: params.note,
    createdAtLocal: now,
  };

  if (typeof navigator !== "undefined" && navigator.onLine) {
    const supabase = getSupabase();
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "");
    const { data: { session } } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    if (session && backendUrl) {
      const response = await fetch(`${backendUrl}/api/customers/credit-payment`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(payload) });
      if (!response.ok) { const result = await response.json(); throw new Error(result?.error?.message ?? "Could not record repayment."); }
      return movement;
    }
  }

  await db.transaction("rw", db.customerCreditMovements, db.outbox, async () => {
    const tenantMovement = await withLocalBusinessId(movement);
    const tenantPayload = await withLocalBusinessId(payload);
    await db.customerCreditMovements.add(tenantMovement);
    await enqueueOutboxWrite(movementId, "credit_payment", tenantPayload, now);
  });

  return movement;
}
