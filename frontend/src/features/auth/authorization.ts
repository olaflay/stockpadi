export const ACCOUNT_TYPES = ["ADMIN", "BUSINESS_OWNER", "WORKER"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const WORKER_CAPABILITIES = [
  "POS_SELL", "VIEW_PRODUCTS", "VIEW_BRANCH_STOCK", "VIEW_STOCK_MOVEMENTS",
  "SUBMIT_STOCK_COUNT", "SUBMIT_RECONCILIATION", "VIEW_CUSTOMERS",
  "USE_CUSTOMER_CREDIT", "VIEW_OWN_SALES", "VIEW_RECEIPTS", "VIEW_ALERTS",
] as const;
export type WorkerCapability = (typeof WORKER_CAPABILITIES)[number];

export const ALL_ACCOUNT_TYPES: readonly AccountType[] = ACCOUNT_TYPES;
export const BUSINESS_MANAGEMENT_ACCOUNT_TYPES: readonly AccountType[] = ["ADMIN", "BUSINESS_OWNER"];
export const WORKER_EXPERIENCE_ACCOUNT_TYPES: readonly AccountType[] = ACCOUNT_TYPES;
