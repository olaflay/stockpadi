import type { CurrentUser } from "@/features/auth/use-current-user";
import { addCreditCustomer } from "@/features/pos/add-credit-customer";
import { addSupplier } from "@/features/purchases/add-supplier";
import { normalizePhone } from "@/lib/phone";

export type SaveContactKind = "customer" | "supplier" | "both";

export interface SaveContactParams {
  name: string;
  phone: string;
  kind: SaveContactKind;
  actor: CurrentUser;
}

/**
 * Saves a new contact as a customer, supplier, or both.
 * Follows the transactional outbox queue pattern for offline-first data safety.
 */
export async function saveNewContact(params: SaveContactParams): Promise<{
  customerId?: string;
  supplierId?: string;
}> {
  const trimmedName = params.name.trim();
  if (!trimmedName) {
    throw new Error("Contact name is required");
  }

  const normalizedPhone = normalizePhone(params.phone) ?? params.phone.trim();
  const result: { customerId?: string; supplierId?: string } = {};

  if (params.kind === "customer" || params.kind === "both") {
    const customer = await addCreditCustomer(trimmedName, normalizedPhone);
    result.customerId = customer.id;
  }

  if (params.kind === "supplier" || params.kind === "both") {
    const supplier = await addSupplier({
      name: trimmedName,
      phone: normalizedPhone || null,
      actor: params.actor,
    });
    result.supplierId = supplier.id;
  }

  return result;
}
