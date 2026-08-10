import type { Role } from "@/types/roles";

/**
 * The PRD Section 14 / .agents/rules/database-and-rls.md permission matrix,
 * as data instead of scattered `hasRole(user, [...])` arrays, so the
 * Staff & Access permission-toggle UI (docs/RESEARCH-AND-PLAN.md Phase 2
 * item 15) has one source of truth to render and compare against.
 *
 * "limited" is spelled out per action below rather than left as a vague
 * label — these are the confirmed definitions, matching
 * supabase/migrations/20260807054734_rls_policies.sql:
 *   - manage_expenses/Manager: insert + view, no delete.
 *   - view_audit_log/Manager: view, except role_change and pin_reset entries.
 *   - view_reports/Inventory Staff: low-stock view only, no sales/revenue.
 */
export const PERMISSION_ACTIONS = [
  "view_sales",
  "process_sale",
  "void_sale",
  "edit_products",
  "stock_adjustments",
  "view_reports",
  "manage_expenses",
  "manage_staff",
  "change_settings",
  "view_audit_log",
] as const;

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export type PermissionLevel = "yes" | "no" | "own_only" | "limited";

export const PERMISSION_LABELS: Record<PermissionAction, string> = {
  view_sales: "View sales",
  process_sale: "Process a sale",
  void_sale: "Void / refund a sale",
  edit_products: "Add or edit products",
  stock_adjustments: "Stock adjustments",
  view_reports: "View reports",
  manage_expenses: "Manage expenses",
  manage_staff: "Manage staff & roles",
  change_settings: "Change settings",
  view_audit_log: "View audit log",
};

export const PERMISSION_LIMITED_NOTES: Partial<Record<PermissionAction, Partial<Record<Role, string>>>> = {
  manage_expenses: { manager: "Can add and view expenses, cannot delete them." },
  view_audit_log: { manager: "Can view the audit log, except role-change and PIN-reset entries." },
  view_reports: { inventory_staff: "Low-stock view only, no sales or revenue figures." },
};

export const PERMISSION_MATRIX: Record<PermissionAction, Record<Role, PermissionLevel>> = {
  view_sales: { owner: "yes", manager: "yes", cashier: "own_only", inventory_staff: "no", accountant: "yes", admin: "yes", super_admin: "no" },
  process_sale: { owner: "yes", manager: "yes", cashier: "yes", inventory_staff: "no", accountant: "no", admin: "yes", super_admin: "no" },
  void_sale: { owner: "yes", manager: "yes", cashier: "no", inventory_staff: "no", accountant: "no", admin: "yes", super_admin: "no" },
  edit_products: { owner: "yes", manager: "yes", cashier: "no", inventory_staff: "yes", accountant: "no", admin: "yes", super_admin: "no" },
  stock_adjustments: { owner: "yes", manager: "yes", cashier: "no", inventory_staff: "yes", accountant: "no", admin: "yes", super_admin: "no" },
  view_reports: { owner: "yes", manager: "yes", cashier: "no", inventory_staff: "limited", accountant: "yes", admin: "yes", super_admin: "no" },
  manage_expenses: { owner: "yes", manager: "limited", cashier: "no", inventory_staff: "no", accountant: "yes", admin: "yes", super_admin: "no" },
  manage_staff: { owner: "yes", manager: "no", cashier: "no", inventory_staff: "no", accountant: "no", admin: "yes", super_admin: "no" },
  change_settings: { owner: "yes", manager: "no", cashier: "no", inventory_staff: "no", accountant: "no", admin: "yes", super_admin: "no" },
  view_audit_log: { owner: "yes", manager: "limited", cashier: "no", inventory_staff: "no", accountant: "no", admin: "yes", super_admin: "no" },
};

export function roleHasPermission(role: Role, action: PermissionAction): boolean {
  const level = PERMISSION_MATRIX[action][role];
  return level === "yes" || level === "limited" || level === "own_only";
}
