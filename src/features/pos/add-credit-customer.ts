import { db, type LocalCustomer } from "@/lib/db";
import { enqueueOutboxWrite } from "@/features/sync/enqueue-outbox-write";

/**
 * Queued for sync, not just written locally: an offline-created customer
 * that never syncs is lost if this device is lost, which is exactly the
 * trust the app promises. See docs/RESEARCH-AND-PLAN.md Section 1.2.
 */
export async function addCreditCustomer(name: string, phone: string): Promise<LocalCustomer> {
  const id = crypto.randomUUID();
  const customer: LocalCustomer = {
    id,
    name,
    phone: phone.trim() || null,
    updatedAt: new Date().toISOString(),
  };

  await db.transaction("rw", db.customers, db.outbox, async () => {
    await db.customers.add(customer);
    await enqueueOutboxWrite(id, "customer", customer, customer.updatedAt);
  });

  return customer;
}
