"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchStaffAudit, type StaffAuditItem } from "@/features/auth/manage-staff-client";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { ScrollText } from "lucide-react";

const ACTION_LABELS: Record<string, string> = {
  staff_created: "Staff added",
  role_change: "Role changed",
  pin_reset: "Password reset",
  password_reset: "Password reset",
  staff_deactivated: "Staff deactivated",
  void_sale: "Sale cancelled",
  adjustment: "Stock adjustment",
};

/** Business Owner read-only view of staff-admin actions. */
export default function StaffAuditPage() {
  const router = useRouter();
  const user = useCurrentUser();

  const [logs, setLogs] = useState<StaffAuditItem[] | undefined>();
  useEffect(() => { fetchStaffAudit().then((result) => setLogs(result.logs)).catch(() => setLogs([])); }, []);

  if (user.accountType !== "BUSINESS_OWNER") {
    return (
      <div>
        <ScreenHeader title="Audit log" onBack={() => router.push("/staff")} />
        <PermissionDenied requiredAccountType="BUSINESS_OWNER" />
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
              Actor {log.actor_user_id.slice(0, 8)} · {new Date(log.created_at).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
