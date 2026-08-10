import { db } from "@/lib/db";
import { PERMISSION_MATRIX, PERMISSION_LABELS, type PermissionAction } from "@/types/permissions";
import type { CurrentUser } from "@/features/auth/use-current-user";

export class PermissionError extends Error {}

/**
 * The write-path enforcement point, the second of the three the plan calls
 * for (UI, Dexie write path, RLS) — see docs/RESEARCH-AND-PLAN.md Section
 * 4.2: "A cashier who edits IndexedDB in DevTools must still be rejected."
 * A screen-level `hasRole` check alone only hides a button; this throws
 * before the write itself happens, called from the write functions
 * (completeSale, writeStockAdjustment, recordCreditPayment, product
 * create/update, branch add) not from screens.
 */
export async function assertPermission(user: CurrentUser, action: PermissionAction): Promise<void> {
  const localUser = await db.localUsers.get(user.id);
  const override = localUser?.permissionOverrides?.[action];
  const allowed = override ?? PERMISSION_MATRIX[action][user.role] !== "no";
  if (!allowed) {
    throw new PermissionError(`${PERMISSION_LABELS[action]} requires a different role.`);
  }
}
