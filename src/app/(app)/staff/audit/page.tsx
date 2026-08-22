"use client";

import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { useCurrentUser, hasRole } from "@/features/auth/use-current-user";
import { ScrollText } from "lucide-react";

const ACTION_LABELS: Record<string, string> = {
  staff_created: "Staff added",
  role_change: "Role changed",
  pin_reset: "PIN reset",
  staff_deactivated: "Staff deactivated",
  void_sale: "Sale cancelled",
  adjustment: "Stock adjustment",
};

// Manager sees everything except role changes and PIN resets, per the
// confirmed "Limited" definition in src/types/permissions.ts.
const MANAGER_HIDDEN_ACTIONS = new Set(["role_change", "pin_reset"]);

/** Owner/Admin (and Manager, filtered) read-only view of staff-admin actions. */
export default function StaffAuditPage() {
  const router = useRouter();
  const user = useCurrentUser();

  const logs = useLiveQuery(async () => {
    const all = await db.auditLogs.orderBy("createdAtLocal").reverse().toArray();
    return user.role === "manager" ? all.filter((log) => !MANAGER_HIDDEN_ACTIONS.has(log.action)) : all;
  }, [user.role]);

  const names = useLiveQuery(async () => {
    const users = await db.localUsers.toArray();
    return new Map(users.map((u) => [u.id, u.fullName]));
  }, []);

  if (!hasRole(user, ["owner", "manager", "admin"])) {
    return (
      <div>
        <ScreenHeader title="Audit log" onBack={() => router.push("/staff")} />
        <PermissionDenied requiredRoles={["owner", "manager", "admin"]} />
      </div>
    );
  }

  if (logs === undefined) {
    return (
      <div>
        <ScreenHeader title="Audit log" onBack={() => router.push("/staff")} />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-140px)] flex-col">
        <ScreenHeader title="Audit log" onBack={() => router.push("/staff")} />
        <div className="flex flex-1 items-center justify-center">
          <EmptyState icon={ScrollText} title="Nothing logged yet" description="Staff and role changes will show up here." />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ScreenHeader title="Audit log" onBack={() => router.push("/staff")} />
      <div className="flex flex-col divide-y divide-border rounded-[var(--radius-card)] border border-border">
        {logs.map((log) => (
          <div key={log.id} className="flex flex-col gap-0.5 px-4 py-3">
            <p className="text-[length:var(--font-size-body)] text-on-surface">{ACTION_LABELS[log.action] ?? log.action}</p>
            <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
              {names?.get(log.actorUserId) ?? "Unknown"} · {new Date(log.createdAtLocal).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
