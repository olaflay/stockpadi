import { db } from "@/lib/db";
import type { Supplier } from "@/types/purchase";
import { assertPermission } from "@/features/auth/assert-permission";
import type { CurrentUser } from "@/features/auth/use-current-user";
import { enqueueOutboxWrite } from "@/features/sync/enqueue-outbox-write";

/**
 * Same shape as the inline "New customer" add during checkout
 * (src/app/(app)/pos/page.tsx) — a plain create, queued for sync so an
 * offline-created supplier isn't lost if this device is lost. See
 * docs/RESEARCH-AND-PLAN.md Section 1.2.
 */
export async function addSupplier(params: {
  name: string;
  phone: string | null;
  actor: CurrentUser;
}): Promise<Supplier> {
  await assertPermission(params.actor, "stock_adjustments");

  const supplier: Supplier = {
    id: crypto.randomUUID(),
    name: params.name,
    phone: params.phone,
    updatedAt: new Date().toISOString(),
  };

  await db.transaction("rw", db.suppliers, db.outbox, async () => {
    await db.suppliers.add(supplier);
    await enqueueOutboxWrite(supplier.id, "supplier", supplier, supplier.updatedAt);
  });

  return supplier;
}
