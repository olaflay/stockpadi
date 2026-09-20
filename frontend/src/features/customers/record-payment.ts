import { db, type CustomerCreditMovement } from "@/lib/db";
import type { CurrentUser } from "@/features/auth/use-current-user";
import { getCustomerCreditBalance } from "@/features/customers/credit";
import { enqueueOutboxWrite } from "@/features/sync/enqueue-outbox-write";
import { withLocalBusinessId } from "@/lib/local-tenant";
import { assertHighRiskWriteAllowed } from "@/features/sync/sync-safety";
import { assertCapability } from "@/features/auth/authorization";

export interface CreditPaymentPayload {
  businessId?: string;
  id: string;
  clientId: string;
  customerId: string;
  amount: number;
  note: string | null;
  createdAtLocal: string;
}

/** Credit repayments are ledger events and always use the durable local path. */
export async function recordCreditPayment(params: {
  customerId: string;
  amount: number;
  note: string | null;
  createdByUserId: string;
  actor: CurrentUser;
}): Promise<CustomerCreditMovement> {
  assertCapability(params.actor, "RECORD_REPAYMENT");
  await assertHighRiskWriteAllowed("credit_payment");
  if (params.amount <= 0) throw new Error("Payment amount must be greater than zero.");
  const currentBalance = await getCustomerCreditBalance(params.customerId);
  if (currentBalance > 0 && params.amount > currentBalance * 2) {
    throw new Error(`That's more than double the ₦${currentBalance.toLocaleString()} owed — double-check the amount before saving.`);
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

  await db.transaction("rw", db.customerCreditMovements, db.outbox, async () => {
    await db.customerCreditMovements.add(await withLocalBusinessId(movement));
    await enqueueOutboxWrite(movementId, "credit_payment", await withLocalBusinessId(payload), now);
  });
  return movement;
}
