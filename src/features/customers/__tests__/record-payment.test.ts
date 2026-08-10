import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getCustomerCreditBalance } from "@/features/customers/credit";
import { recordCreditPayment } from "@/features/customers/record-payment";
import type { CurrentUser } from "@/features/auth/use-current-user";

const CUSTOMER_ID = "customer-1";
const CASHIER: CurrentUser = { id: "user-1", fullName: "Cashier", role: "cashier" };

describe("recordCreditPayment", () => {
  beforeEach(async () => {
    await db.customerCreditMovements.clear();
    await db.outbox.clear();
  });

  it("writes a negative amountDelta, never an update to a stored balance", async () => {
    const movement = await recordCreditPayment({
      customerId: CUSTOMER_ID,
      amount: 500,
      note: "Part payment",
      createdByUserId: CASHIER.id,
      actor: CASHIER,
    });

    expect(movement.amountDelta).toBe(-500);
    expect(await getCustomerCreditBalance(CUSTOMER_ID)).toBe(-500);

    const outboxItem = await db.outbox.get(movement.clientId);
    expect(outboxItem?.type).toBe("credit_payment");
  });

  it("rejects a non-positive amount", async () => {
    await expect(
      recordCreditPayment({ customerId: CUSTOMER_ID, amount: 0, note: null, createdByUserId: CASHIER.id, actor: CASHIER })
    ).rejects.toThrow();
  });

  /**
   * The mandatory concurrent-write case for this ledger table, per
   * .agents/skills/write-offline-conflict-test.md: a credit sale on one
   * device and a payment recorded on another must both survive once both
   * reach the shared ledger, and sum correctly regardless of order.
   */
  it("sums a credit sale from one device and a payment from another, in either order", async () => {
    const saleMovement = {
      id: crypto.randomUUID(),
      clientId: "device-a-sale-1",
      customerId: CUSTOMER_ID,
      amountDelta: 2000,
      sourceReferenceId: "sale-a",
      createdAtLocal: new Date().toISOString(),
      createdByUserId: "device-a-user",
    };

    await db.customerCreditMovements.add(saleMovement);
    const payment = await recordCreditPayment({
      customerId: CUSTOMER_ID,
      amount: 800,
      note: null,
      createdByUserId: CASHIER.id,
      actor: CASHIER,
    });

    expect(await getCustomerCreditBalance(CUSTOMER_ID)).toBe(1200);
    expect(payment.amountDelta).toBe(-800);
  });
});
