import type { SupabaseClient, User } from "@supabase/supabase-js";
import { HttpError } from "../../shared/errors/http-error.js";
import { resolveAccountContext } from "../accounts/account-context.js";
import { requireBusinessOwner, requireAssignedBranch } from "../authorization/capabilities.js";

export async function createExpense(db: SupabaseClient, actor: User, input: unknown) {
  const context = await resolveAccountContext(db, actor);
  if (!context.businessId) throw new HttpError(403, "FORBIDDEN", "A business account is required");
  requireBusinessOwner(context);
  if (!input || typeof input !== "object") throw new HttpError(400, "INVALID_BODY", "Expense payload is required");
  const payload = input as Record<string, unknown>;
  if (typeof payload.id !== "string" || typeof payload.amount !== "number" || payload.amount <= 0 || typeof payload.category !== "string" || !payload.category.trim()) throw new HttpError(400, "INVALID_BODY", "Expense id, category and positive amount are required");
  if (typeof payload.branchId === "string") requireAssignedBranch(context, payload.branchId);
  const { data, error } = await db.rpc("sync_apply_expense", { payload, actor_id: actor.id });
  if (error) throw new HttpError(500, "EXPENSE_FAILED", error.message);
  return data;
}

export async function listExpenses(db: SupabaseClient, actor: User) {
  const context = await resolveAccountContext(db, actor);
  if (!context.businessId) throw new HttpError(403, "FORBIDDEN", "A business account is required");
  requireBusinessOwner(context);
  const { data, error } = await db.from("expenses").select("id, branch_id, category, amount, note, created_at, created_by_user_id").eq("business_id", context.businessId).order("created_at", { ascending: false }).limit(500);
  if (error) throw new HttpError(500, "EXPENSES_LOAD_FAILED", error.message);
  return { expenses: context.accountType === "WORKER" ? (data ?? []).filter((expense) => !expense.branch_id || context.branchIds.includes(expense.branch_id as string)) : (data ?? []) };
}
