export const ROLES = [
  "owner",
  "manager",
  "cashier",
  "inventory_staff",
  "accountant",
  "admin",
  "super_admin",
] as const;

export type Role = (typeof ROLES)[number];
