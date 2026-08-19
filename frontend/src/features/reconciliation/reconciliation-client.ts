import { serverGet, serverPost } from "@/features/operations/server-client";

export interface ReconciliationRecord {
  id: string;
  branch_id: string;
  actor_user_id: string;
  business_date: string;
  expected_cash: number;
  expected_transfer: number;
  expected_pos: number;
  expected_credit: number;
  actual_cash: number;
  discrepancy: number;
  note: string | null;
  created_at: string;
}

export function submitReconciliation(input: { branchId: string; actualCash: number; expectedCash: number; expectedTransfer: number; expectedPos: number; expectedCredit: number; discrepancy: number; note: string | null; }) {
  return serverPost<ReconciliationRecord>("/api/reconciliation/submit", input);
}

export function fetchReconciliationHistory() {
  return serverGet<{ records: ReconciliationRecord[] }>("/api/reconciliation/history");
}
