export const ACCOUNT_TYPES = ["ADMIN", "BUSINESS_OWNER", "WORKER"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const CAPABILITIES = [
  "sales.create",
  "sales.view_own",
  "sales.view_all",
  "inventory.view",
  "inventory.receive",
  "inventory.adjust",
  "customers.view",
  "customers.manage",
  "expenses.create",
  "expenses.view",
  "reports.view",
  "reconciliation.create",
  "reconciliation.approve",
  "staff.view",
  "staff.manage",
  "debts.view",
  "debts.manage",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export type LegacyRole =
  | "owner"
  | "manager"
  | "cashier"
  | "inventory_staff"
  | "accountant"
  | "admin"
  | "super_admin";

export function accountTypeForLegacyRole(role: LegacyRole): AccountType {
  if (role === "super_admin") return "ADMIN";
  if (role === "owner") return "BUSINESS_OWNER";
  return "WORKER";
}

export function hasCapability(
  accountType: AccountType,
  capabilities: readonly Capability[],
  capability: Capability,
): boolean {
  if (accountType === "ADMIN" || accountType === "BUSINESS_OWNER") return true;
  return capabilities.includes(capability);
}
