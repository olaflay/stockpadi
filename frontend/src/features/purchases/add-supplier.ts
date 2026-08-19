import { db } from "@/lib/db";
import type { Supplier } from "@/types/purchase";
import type { CurrentUser } from "@/features/auth/use-current-user";
import { enqueueOutboxWrite } from "@/features/sync/enqueue-outbox-write";
import { withLocalBusinessId } from "@/lib/local-tenant";

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
  const supplier: Supplier = {
    id: crypto.randomUUID(),
    name: params.name,
    phone: params.phone,
    updatedAt: new Date().toISOString(),
  };

  await db.transaction("rw", db.suppliers, db.outbox, async () => {
    const tenantSupplier = await withLocalBusinessId(supplier);
    await db.suppliers.add(tenantSupplier);
    await enqueueOutboxWrite(supplier.id, "supplier", tenantSupplier, supplier.updatedAt);
  });

  return supplier;
}
