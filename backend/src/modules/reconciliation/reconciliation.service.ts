import type { SupabaseClient, User } from "@supabase/supabase-js";
import { reportSummary } from "../reports/report.service.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { resolveAccountContext } from "../accounts/account-context.js";
export async function closeDaySummary(db: SupabaseClient, actor: User, input: unknown) { return reportSummary(db, actor, input); }

export async function submitReconciliation(db: SupabaseClient, actor: User, input: unknown) {
  const context = await resolveAccountContext(db, actor);
  if (!context.businessId) throw new HttpError(403, "FORBIDDEN", "A business account is required");
  const body = input as Record<string, unknown>;
  if (typeof body.branchId !== "string" || typeof body.actualCash !== "number") throw new HttpError(400, "INVALID_BODY", "Branch and actual cash are required");
  if (context.accountType === "WORKER" && !context.branchIds.includes(body.branchId)) throw new HttpError(403, "FORBIDDEN", "Branch is outside this account's assigned branches");
  const row = { business_id: context.businessId, branch_id: body.branchId, actor_user_id: actor.id, business_date: typeof body.businessDate === "string" ? body.businessDate : new Date().toISOString().slice(0, 10), expected_cash: Number(body.expectedCash ?? 0), expected_transfer: Number(body.expectedTransfer ?? 0), expected_pos: Number(body.expectedPos ?? 0), expected_credit: Number(body.expectedCredit ?? 0), actual_cash: body.actualCash, discrepancy: Number(body.discrepancy ?? 0), note: typeof body.note === "string" ? body.note : null };
  const { data, error } = await db.from("reconciliation_records").insert(row).select().single();
  if (error) throw new HttpError(500, "RECONCILIATION_FAILED", error.message);
  return data;
}

export async function reconciliationHistory(db: SupabaseClient, actor: User) {
  const context = await resolveAccountContext(db, actor);
  if (!context.businessId) throw new HttpError(403, "FORBIDDEN", "A business account is required");
  const { data, error } = await db.from("reconciliation_records").select("*").eq("business_id", context.businessId).order("created_at", { ascending: false }).limit(100);
  if (error) throw new HttpError(500, "RECONCILIATION_HISTORY_FAILED", error.message);
  return { records: data ?? [] };
}
