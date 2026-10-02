import { beforeEach, describe, expect, it } from "vitest";
import { db, BUSINESS_PROFILE_SINGLETON_ID } from "@/lib/db";
import { clearLocalBusinessId } from "@/lib/local-tenant";
import { addCreditCustomer } from "../add-credit-customer";

describe("addCreditCustomer", () => {
  beforeEach(async () => {
    clearLocalBusinessId();
    await db.customers.clear();
    await db.outbox.clear();
    await db.businessProfile.put({
      id: BUSINESS_PROFILE_SINGLETON_ID,
      businessId: "biz-customer-test",
      name: "Customer Test Shop",
      businessTypeId: "retail",
      currency: "NGN",
    });
  });

  it("persists a new customer to Dexie and queues an outbox entry with business_id", async () => {
    const customer = await addCreditCustomer("Musa Ibrahim", " 08012345678 ");

    expect(customer.id).toBeDefined();
    expect(customer.name).toBe("Musa Ibrahim");
    expect(customer.phone).toBe("08012345678");

    // Local IndexedDB customer row
    const savedCustomer = await db.customers.get(customer.id);
    expect(savedCustomer).toBeDefined();
    expect(savedCustomer?.name).toBe("Musa Ibrahim");
    expect(savedCustomer?.businessId).toBe("biz-customer-test");
    expect(savedCustomer?.phone).toBe("08012345678");

    // Queued outbox item
    const outboxItem = await db.outbox.where("clientId").equals(customer.id).first();
    expect(outboxItem).toBeDefined();
    expect(outboxItem?.type).toBe("customer");
    expect(outboxItem?.status).toBe("pending");
    expect(outboxItem?.businessId).toBe("biz-customer-test");
    expect((outboxItem?.payload as { name?: string })?.name).toBe("Musa Ibrahim");
  });

  it("normalizes empty phone numbers to null", async () => {
    const customer = await addCreditCustomer("Grace Okon", "   ");

    expect(customer.phone).toBeNull();
    const savedCustomer = await db.customers.get(customer.id);
    expect(savedCustomer?.phone).toBeNull();
  });
});
