export const ACCOUNT_TYPES = ["ADMIN", "BUSINESS_OWNER", "WORKER"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
import type { WorkerCapability } from "@stockpadi/contracts";
export { WORKER_CAPABILITIES } from "@stockpadi/contracts";
export type { WorkerCapability } from "@stockpadi/contracts";

export const ALL_ACCOUNT_TYPES: readonly AccountType[] = ACCOUNT_TYPES;
export const BUSINESS_MANAGEMENT_ACCOUNT_TYPES: readonly AccountType[] = ["ADMIN", "BUSINESS_OWNER"];
export const WORKER_EXPERIENCE_ACCOUNT_TYPES: readonly AccountType[] = ACCOUNT_TYPES;

const IMPLIED_CAPABILITIES: Partial<Record<WorkerCapability, readonly WorkerCapability[]>> = {
  POS_SELL: ["VIEW_PRODUCTS", "VIEW_BRANCH_STOCK"],
  // Anyone who can see branch stock needs the corresponding low-stock
  // warning; this keeps alerts useful without requiring a second permission.
  VIEW_BRANCH_STOCK: ["VIEW_ALERTS"],
  MANAGE_PRODUCTS: ["VIEW_PRODUCTS", "VIEW_STOCK_MOVEMENTS"],
  ADJUST_STOCK: ["VIEW_PRODUCTS", "VIEW_BRANCH_STOCK", "VIEW_STOCK_MOVEMENTS"],
  SUBMIT_STOCK_COUNT: ["VIEW_PRODUCTS", "VIEW_BRANCH_STOCK"],
  RECEIVE_STOCK: ["VIEW_PRODUCTS", "VIEW_BRANCH_STOCK"],
  USE_CUSTOMER_CREDIT: ["VIEW_CUSTOMERS"],
  CREATE_CUSTOMERS: ["VIEW_CUSTOMERS"],
  RECORD_REPAYMENT: ["VIEW_CUSTOMERS"],
};

function hasImpliedCapability(
  granted: WorkerCapability,
  requested: WorkerCapability,
  visited = new Set<WorkerCapability>(),
): boolean {
  if (granted === requested) return true;
  if (visited.has(granted)) return false;
  visited.add(granted);
  return IMPLIED_CAPABILITIES[granted]?.some((capability) => hasImpliedCapability(capability, requested, visited)) ?? false;
}

export function hasCapability(
  user: { accountType?: AccountType; permissions?: readonly WorkerCapability[] },
  capability: WorkerCapability,
): boolean {
  return user.accountType === "ADMIN" || user.accountType === "BUSINESS_OWNER" || Boolean(
    user.permissions?.some((granted) => hasImpliedCapability(granted, capability))
  );
}

export function assertCapability(
  user: { accountType?: AccountType; permissions?: readonly WorkerCapability[] },
  capability: WorkerCapability,
): void {
  if (!hasCapability(user, capability)) {
    throw new Error(`Your account does not have the ${capability.replaceAll("_", " ").toLowerCase()} permission.`);
  }
}
