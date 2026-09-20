import type { AccountContext } from "../accounts/account-context.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { WORKER_CAPABILITIES, type WorkerCapability } from "@stockpadi/contracts";

export { WORKER_CAPABILITIES };
export type { WorkerCapability };
export type Capability = WorkerCapability;

const OWNER_CAPABILITIES = new Set<Capability>([
  "POS_SELL", "VIEW_PRODUCTS", "VIEW_BRANCH_STOCK", "VIEW_STOCK_MOVEMENTS",
  "SUBMIT_STOCK_COUNT", "SUBMIT_RECONCILIATION", "VIEW_BRANCH_RECONCILIATION",
  "VIEW_CUSTOMERS", "USE_CUSTOMER_CREDIT", "RECORD_REPAYMENT", "RECEIVE_STOCK", "CREATE_CUSTOMERS",
  "VIEW_OWN_SALES", "VIEW_RECEIPTS", "VIEW_ALERTS", "MANAGE_PRODUCTS", "ADJUST_STOCK",
  "MANAGE_EXPENSES", "VIEW_REPORTS", "MANAGE_BRANCHES", "MANAGE_BRANCH_WORKERS",
]);

const IMPLIED_CAPABILITIES: Partial<Record<Capability, readonly Capability[]>> = {
  POS_SELL: ["VIEW_PRODUCTS", "VIEW_BRANCH_STOCK"],
  MANAGE_PRODUCTS: ["VIEW_PRODUCTS", "VIEW_STOCK_MOVEMENTS"],
  ADJUST_STOCK: ["VIEW_PRODUCTS", "VIEW_BRANCH_STOCK", "VIEW_STOCK_MOVEMENTS"],
  SUBMIT_STOCK_COUNT: ["VIEW_PRODUCTS", "VIEW_BRANCH_STOCK"],
  RECEIVE_STOCK: ["VIEW_PRODUCTS", "VIEW_BRANCH_STOCK"],
  USE_CUSTOMER_CREDIT: ["VIEW_CUSTOMERS"],
  CREATE_CUSTOMERS: ["VIEW_CUSTOMERS"],
  RECORD_REPAYMENT: ["VIEW_CUSTOMERS"],
};

export function hasCapability(context: { accountType: AccountContext["accountType"]; permissions: readonly WorkerCapability[] }, capability: Capability): boolean {
  if (context.accountType === "ADMIN") return true;
  if (context.accountType === "BUSINESS_OWNER") return OWNER_CAPABILITIES.has(capability);
  if (context.accountType === "WORKER") {
    return context.permissions.includes(capability as WorkerCapability)
      || context.permissions.some((granted) => IMPLIED_CAPABILITIES[granted]?.includes(capability));
  }
  return false;
}

export function requireCapability(context: { accountType: AccountContext["accountType"]; permissions: readonly WorkerCapability[] }, capability: Capability): void {
  if (!hasCapability(context, capability)) {
    throw new HttpError(403, "FORBIDDEN", `This account cannot perform ${capability}`);
  }
}

export function requireBusinessOwner(context: Pick<AccountContext, "accountType">): void {
  if (context.accountType !== "BUSINESS_OWNER") {
    throw new HttpError(403, "FORBIDDEN", "Only a Business Owner can perform this operation");
  }
}

export function requireAssignedBranch(context: Pick<AccountContext, "accountType" | "branchIds">, branchId: string): void {
  if (context.accountType === "WORKER" && !context.branchIds.includes(branchId)) {
    throw new HttpError(403, "FORBIDDEN", "Branch is outside this account's assigned branches");
  }
}
