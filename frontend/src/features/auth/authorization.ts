export const ACCOUNT_TYPES = ["ADMIN", "BUSINESS_OWNER", "WORKER"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ALL_ACCOUNT_TYPES: readonly AccountType[] = ACCOUNT_TYPES;
export const BUSINESS_MANAGEMENT_ACCOUNT_TYPES: readonly AccountType[] = ["ADMIN", "BUSINESS_OWNER"];
export const WORKER_EXPERIENCE_ACCOUNT_TYPES: readonly AccountType[] = ACCOUNT_TYPES;
