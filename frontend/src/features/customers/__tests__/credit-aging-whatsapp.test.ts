import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  getCustomerDebtAges,
  getAgingBucket,
  getAllCustomerCreditBalances,
  getCustomerCreditBalance,
} from "@/features/customers/credit";
import { buildWhatsAppUrl, normalizeNigerianPhone } from "@/lib/whatsapp";
import { toKobo, fromKobo, sumNairaAmounts, multiplyNaira } from "@/lib/kobo";

describe("Customer Debt Aging & WhatsApp Integration", () => {
  const CUSTOMER_RECENT = "cust-recent";
  const CUSTOMER_OVERDUE = "cust-overdue";

  beforeEach(async () => {
    await db.customerCreditMovements.clear();
  });

  it("assigns appropriate aging buckets based on days elapsed", () => {
    expect(getAgingBucket(3).label).toBe("Current");
    expect(getAgingBucket(7).label).toBe("Current");
    expect(getAgingBucket(14).label).toBe("14d");
    expect(getAgingBucket(45).label).toBe("45d");
    expect(getAgingBucket(120).label).toBe("120d+");
  });

  it("accurately calculates debt ages and balances from the append-only ledger", async () => {
    const now = Date.now();
    const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString();
    const fortyDaysAgo = new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString();

    // Customer 1: recent debt (10 days ago)
    await db.customerCreditMovements.add({
      id: "mov-1",
      clientId: "client-mov-1",
      customerId: CUSTOMER_RECENT,
      amountDelta: 5000,
      sourceReferenceId: "sale-1",
      createdAtLocal: tenDaysAgo,
      createdByUserId: "user-1",
    });

    // Customer 2: older debt (40 days ago)
    await db.customerCreditMovements.add({
      id: "mov-2",
      clientId: "client-mov-2",
      customerId: CUSTOMER_OVERDUE,
      amountDelta: 15000,
      sourceReferenceId: "sale-2",
      createdAtLocal: fortyDaysAgo,
      createdByUserId: "user-1",
    });

    const ages = await getCustomerDebtAges();
    expect(ages.get(CUSTOMER_RECENT)).toBeGreaterThanOrEqual(9);
    expect(ages.get(CUSTOMER_RECENT)).toBeLessThanOrEqual(11);

    expect(ages.get(CUSTOMER_OVERDUE)).toBeGreaterThanOrEqual(39);
    expect(ages.get(CUSTOMER_OVERDUE)).toBeLessThanOrEqual(41);

    const balances = await getAllCustomerCreditBalances();
    expect(balances.get(CUSTOMER_RECENT)).toBe(5000);
    expect(balances.get(CUSTOMER_OVERDUE)).toBe(15000);
    expect(await getCustomerCreditBalance(CUSTOMER_RECENT)).toBe(5000);
  });

  it("builds valid Nigerian WhatsApp reminder URLs", () => {
    const phone = "0803 123 4567";
    const normalized = normalizeNigerianPhone(phone);
    expect(normalized).toBe("2348031234567");

    const message = "Hi Chief Okon, your balance is ₦5,000. Thank you!";
    const url = buildWhatsAppUrl(phone, message);
    expect(url).toContain("https://wa.me/2348031234567?text=");
    expect(url).toContain(encodeURIComponent(message));
  });

  it("guarantees zero IEEE-754 floating point drift using integer kobo arithmetic", () => {
    // Classic JavaScript floating point bug: 0.1 + 0.2 = 0.30000000000000004
    const floatSum = 0.1 + 0.2;
    expect(floatSum).not.toBe(0.3);

    // StockPadi integer kobo arithmetic guarantees exact 0.30
    const koboSum = sumNairaAmounts([0.1, 0.2]);
    expect(koboSum).toBe(0.3);

    // Conversion tests
    expect(toKobo(1500.5)).toBe(150050);
    expect(toKobo("2400.75")).toBe(240075);
    expect(fromKobo(150050)).toBe(1500.5);

    // Multiplication
    expect(multiplyNaira(125.5, 3)).toBe(376.5);
  });
});
