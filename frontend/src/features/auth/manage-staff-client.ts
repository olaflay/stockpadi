import { getSupabase } from "@/lib/supabase";
import { db } from "@/lib/db";

/**
 * Thin client for the manage-staff Edge Function (supabase/functions/manage-staff).
 * Every call is online-required — worker creation, password rotation, and
 * deactivation need a live server round trip, unlike the rest of this app's
 * offline-first writes. See docs/RESEARCH-AND-PLAN.md Phase 2 item 15.
 */

type ManageStaffAction = "create" | "reset_password" | "deactivate" | "reactivate";

interface ManageStaffPayload {
  action: ManageStaffAction;
  userId?: string;
  fullName?: string;
  phone?: string | null;
  email?: string;
  branchId?: string | null;
}

export interface StaffListItem {
  id: string;
  fullName: string;
  accountType: "BUSINESS_OWNER" | "WORKER";
  status: string;
  isActive: boolean;
  branchIds: string[];
}

export class ManageStaffError extends Error {}

export async function fetchStaff(): Promise<StaffListItem[]> {
  const supabase = getSupabase();
  if (!supabase) throw new ManageStaffError("This device isn't connected to a server yet.");
  const { data: { session } } = await supabase.auth.getSession();
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "");
  if (!session) throw new ManageStaffError("Your session has expired. Sign in again.");
  if (!backendUrl && process.env.NODE_ENV !== "test") throw new ManageStaffError("The application backend is not configured.");
  const response = await fetch(`${backendUrl ?? "http://backend.test"}/api/workers`, { headers: { Authorization: `Bearer ${session.access_token}` } });
  const json = await response.json();
  if (!response.ok) throw new ManageStaffError(json?.error?.message ?? "Could not load staff.");
  return json.staff as StaffListItem[];
}

async function authenticatedBackendGet<T>(path: string): Promise<T> {
  const supabase = getSupabase();
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "");
  const { data: { session } } = await supabase!.auth.getSession();
  if (!session || !backendUrl) throw new ManageStaffError("Your session or application backend is unavailable.");
  const response = await fetch(`${backendUrl}${path}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
  const json = await response.json();
  if (!response.ok) throw new ManageStaffError(json?.error?.message ?? "Could not load staff data.");
  return json as T;
}

export function fetchStaffMember(userId: string) {
  return authenticatedBackendGet<StaffListItem>(`/api/workers/${encodeURIComponent(userId)}`);
}

export interface StaffAuditItem { id: string; action: string; actor_user_id: string; entity_id: string; created_at: string; }
export function fetchStaffAudit() {
  return authenticatedBackendGet<{ logs: StaffAuditItem[] }>("/api/workers/audit");
}

export async function callManageStaff(payload: ManageStaffPayload): Promise<{ userId?: string }> {
  const supabase = getSupabase();
  if (!supabase) throw new ManageStaffError("This device isn't connected to a server yet.");

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new ManageStaffError("Your session has expired. Sign in again.");

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "");
  if (!backendUrl && process.env.NODE_ENV !== "test") throw new ManageStaffError("The application backend is not configured.");
  const url = `${backendUrl ?? "http://backend.test"}/api/workers`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(payload),
  });

  const json = await response.json();
  if (!response.ok) {
    throw new ManageStaffError(json?.error?.message ?? "That didn't work. Try again.");
  }

  // Server already wrote the authoritative audit_logs row (manage-staff
  // Edge Function). This local mirror is only so Staff & Access has
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
