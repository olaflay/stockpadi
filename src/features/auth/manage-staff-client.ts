import { getSupabase } from "@/lib/supabase";
import type { Role } from "@/types/roles";
import { db } from "@/lib/db";

/**
 * Thin client for the manage-staff Edge Function (supabase/functions/manage-staff).
 * Every call is online-required — staff creation, role changes, and PIN
 * resets all need a live server round trip, unlike the rest of this app's
 * offline-first writes. See docs/RESEARCH-AND-PLAN.md Phase 2 item 15.
 */

type ManageStaffAction = "create" | "change_role" | "reset_pin" | "set_own_pin" | "deactivate";

interface ManageStaffPayload {
  action: ManageStaffAction;
  userId?: string;
  fullName?: string;
  phone?: string | null;
  email?: string;
  initialPassword?: string;
  role?: Role;
  branchId?: string | null;
  pinHash?: string;
}

export class ManageStaffError extends Error {}

export async function callManageStaff(payload: ManageStaffPayload): Promise<{ userId?: string }> {
  const supabase = getSupabase();
  if (!supabase) throw new ManageStaffError("This device isn't connected to a server yet.");

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new ManageStaffError("Your session has expired. Sign in again.");

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-staff`;
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
  if (payload.action !== "set_own_pin") {
    await db.auditLogs.add({
      id: crypto.randomUUID(),
      clientId: crypto.randomUUID(),
      actorUserId: session.user.id,
      action: payload.action === "create" ? "staff_created" : payload.action === "deactivate" ? "staff_deactivated" : payload.action,
      entityType: "users",
      entityId: json.userId ?? payload.userId ?? null,
      beforeState: null,
      afterState: { role: payload.role },
      createdAtLocal: new Date().toISOString(),
    });
  }

  return json;
}
