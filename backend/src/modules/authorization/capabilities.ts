import type { AccountContext } from "../accounts/account-context.js";
import { HttpError } from "../../shared/errors/http-error.js";

export const WORKER_CAPABILITIES = [
  "POS_SELL",
  "VIEW_PRODUCTS",
  "VIEW_BRANCH_STOCK",
  "VIEW_STOCK_MOVEMENTS",
  "SUBMIT_STOCK_COUNT",
  "SUBMIT_RECONCILIATION",
  "VIEW_CUSTOMERS",
  "USE_CUSTOMER_CREDIT",
  "VIEW_OWN_SALES",
  "VIEW_RECEIPTS",
  "VIEW_ALERTS",
] as const;

export type WorkerCapability = (typeof WORKER_CAPABILITIES)[number];
export type Capability = WorkerCapability | "RECEIVE_STOCK" | "RECORD_REPAYMENT" | "VIEW_BRANCH_RECONCILIATION" | "CREATE_CUSTOMERS";

const OWNER_CAPABILITIES = new Set<Capability>([
  "POS_SELL", "VIEW_PRODUCTS", "VIEW_BRANCH_STOCK", "VIEW_STOCK_MOVEMENTS",
  "SUBMIT_STOCK_COUNT", "SUBMIT_RECONCILIATION", "VIEW_BRANCH_RECONCILIATION",
  "VIEW_CUSTOMERS", "USE_CUSTOMER_CREDIT", "RECORD_REPAYMENT", "RECEIVE_STOCK", "CREATE_CUSTOMERS",
  "VIEW_OWN_SALES", "VIEW_RECEIPTS", "VIEW_ALERTS",
]);

export function hasCapability(context: { accountType: AccountContext["accountType"]; permissions: readonly WorkerCapability[] }, capability: Capability): boolean {
  if (context.accountType === "BUSINESS_OWNER") return OWNER_CAPABILITIES.has(capability);
  if (context.accountType === "WORKER") return context.permissions.includes(capability as WorkerCapability);
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
