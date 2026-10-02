import { db, type LocalCustomer } from "@/lib/db";
import { tenantArray } from "@/lib/local-tenant";
import { getAllCustomerCreditBalances, getCustomerDebtAges } from "@/features/customers/credit";
import type { Supplier } from "@/types/purchase";
import { normalizePhone } from "@/lib/phone";
import type { ContactRow } from "./contacts-filter";

/**
 * Loads all customers, customer debts, and suppliers from local Dexie IndexedDB.
 * Merges contacts sharing the exact normalized phone number into a single display row.
 */
export async function loadContactsHubRows(): Promise<ContactRow[]> {
  const [customers, suppliers, balances, debtAges] = await Promise.all([
    tenantArray<LocalCustomer>(db.customers),
    tenantArray<Supplier>(db.suppliers),
    getAllCustomerCreditBalances(),
    getCustomerDebtAges(),
  ]);

  // Phone lookup map for merging customer and supplier sharing the same normalized phone
  const phoneToCustomer = new Map<string, LocalCustomer>();
  const customerRows: ContactRow[] = [];

  for (const customer of customers) {
    const normPhone = normalizePhone(customer.phone);
    if (normPhone) {
      phoneToCustomer.set(normPhone, customer);
    }
    const balance = balances.get(customer.id) ?? 0;
    const debtAgeDays = debtAges.get(customer.id) ?? 0;

    customerRows.push({
      id: `customer:${customer.id}`,
      customerId: customer.id,
      name: customer.name,
      phone: customer.phone,
      kinds: ["customer"],
      balance,
      debtAgeDays,
      updatedAt: customer.updatedAt,
    });
  }

  // Process suppliers: check if already exists in customerRows with same normalized phone
  const mergedRows = [...customerRows];
  const handledSupplierIds = new Set<string>();

  for (const supplier of suppliers) {
    const normPhone = normalizePhone(supplier.phone);
    if (normPhone && phoneToCustomer.has(normPhone)) {
      const matchingCustomer = phoneToCustomer.get(normPhone)!;
      const targetIndex = mergedRows.findIndex((r) => r.customerId === matchingCustomer.id);
      if (targetIndex >= 0) {
        mergedRows[targetIndex] = {
          ...mergedRows[targetIndex],
          supplierId: supplier.id,
          kinds: ["customer", "supplier"],
        };
        handledSupplierIds.add(supplier.id);
      }
    }
  }

  // Add remaining unmerged suppliers
  for (const supplier of suppliers) {
    if (handledSupplierIds.has(supplier.id)) continue;
    mergedRows.push({
      id: `supplier:${supplier.id}`,
      supplierId: supplier.id,
      name: supplier.name,
      phone: supplier.phone,
      kinds: ["supplier"],
      balance: 0,
      debtAgeDays: 0,
      updatedAt: supplier.updatedAt,
    });
  }

  return mergedRows;
}
