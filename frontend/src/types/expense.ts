/**
 * Free text, not a fixed enum — same reasoning as Product.unitLabel: expense
 * categories vary by shop, a picklist would just make the odd one "Other"
 * catch-all. These are suggestions offered in the add form, not a schema
 * constraint.
 */
export const EXPENSE_CATEGORY_SUGGESTIONS = [
  "Rent",
  "Utilities",
  "Transport",
  "Supplies",
  "Salaries",
  "Maintenance",
  "Other",
] as const;

export interface Expense {
  id: string;
  businessId?: string;
  /** Null means business-wide rather than tied to one branch. */
  branchId: string | null;
  category: string;
  amount: number;
  note: string | null;
  createdAtLocal: string;
  createdByUserId: string;
}
