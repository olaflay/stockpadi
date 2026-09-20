import { getSupabase } from "@/lib/supabase";
import { db } from "@/lib/db";
import { serverGet, serverPost } from "@/features/operations/server-client";
import type { WorkerCapability } from "@/features/auth/authorization";

/**
 * Thin client for the Node manage-staff API.
 * Every call is online-required — worker creation, password rotation, and
 * deactivation need a live server round trip, unlike the rest of this app's
 * offline-first writes. See docs/RESEARCH-AND-PLAN.md Phase 2 item 15.
 */

type ManageStaffAction = "create" | "reset_password" | "deactivate" | "reactivate" | "update_permissions" | "assign_branches" | "designate_manager";

interface ManageStaffPayload {
  action: ManageStaffAction;
  userId?: string;
  fullName?: string;
  phone?: string | null;
  email?: string;
  branchId?: string | null;
  capabilities?: WorkerCapability[];
  branchIds?: string[];
  isManager?: boolean;
}

export interface StaffListItem {
  id: string;
  fullName: string;
  email: string | null;
  accountType: "BUSINESS_OWNER" | "WORKER";
  status: string;
  isActive: boolean;
  deactivatedAt: string | null;
  branchIds: string[];
  capabilities: WorkerCapability[];
  managerBranchIds: string[];
}

export class ManageStaffError extends Error {}

export async function fetchStaff(): Promise<StaffListItem[]> {
  try { return (await serverGet<{ staff: StaffListItem[] }>("/api/workers")).staff; }
  catch (error) { throw new ManageStaffError(error instanceof Error ? error.message : "Could not load staff."); }
}

async function authenticatedBackendGet<T>(path: string): Promise<T> {
  try { return await serverGet<T>(path); }
  catch (error) { throw new ManageStaffError(error instanceof Error ? error.message : "Could not load staff data."); }
}

export function fetchStaffMember(userId: string) {
  return authenticatedBackendGet<StaffListItem>(`/api/workers/${encodeURIComponent(userId)}`);
}

export interface StaffAuditItem { id: string; action: string; actor_user_id: string; entity_id: string; created_at: string; }
export function fetchStaffAudit() {
  return authenticatedBackendGet<{ logs: StaffAuditItem[] }>("/api/workers/audit");
}

export async function callManageStaff(payload: ManageStaffPayload): Promise<{ userId?: string; password?: string }> {
  const supabase = getSupabase();
  if (!supabase) throw new ManageStaffError("This device isn't connected to a server yet.");

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new ManageStaffError("Your session has expired. Sign in again.");
  let json: { userId?: string; password?: string };
  try { json = await serverPost<{ userId?: string; password?: string }>("/api/workers", payload); }
  catch (error) { throw new ManageStaffError(error instanceof Error ? error.message : "That didn't work. Try again."); }

  // Server already wrote the authoritative audit_logs row. This local mirror is only so Staff & Access has
  // something to render immediately/offline without a round trip, per
  // docs/RESEARCH-AND-PLAN.md Phase 2 item 15.
  await db.auditLogs.add({
    id: crypto.randomUUID(),
    clientId: crypto.randomUUID(),
    actorUserId: session.user.id,
    action: payload.action === "create" ? "staff_created" : payload.action === "deactivate" ? "staff_deactivated" : payload.action,
    entityType: "users",
    entityId: json.userId ?? payload.userId ?? null,
    beforeState: null,
    afterState: { accountType: payload.action === "create" ? "WORKER" : undefined },
    createdAtLocal: new Date().toISOString(),
  });

  return json;
}
