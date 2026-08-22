"use client";

import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, ChevronRight, ScrollText } from "lucide-react";
import { db } from "@/lib/db";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { RippleButton } from "@/components/ui/Ripple";
import { useCurrentUser, hasRole } from "@/features/auth/use-current-user";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  cashier: "Cashier",
  inventory_staff: "Inventory Staff",
  accountant: "Accountant",
  admin: "Admin",
};

/** "Up to 3 staff on top of the owner." docs/RESEARCH-AND-PLAN.md Section 4.2. */
export const STAFF_CAP = 3;

export default function StaffPage() {
  const router = useRouter();
  const user = useCurrentUser();

  const result = useLiveQuery(async () => {
    try {
      const users = await db.localUsers.toArray();
      users.sort((a, b) => (a.role === "owner" ? -1 : b.role === "owner" ? 1 : a.fullName.localeCompare(b.fullName)));
      return { users, error: null as string | null };
    } catch (err) {
      return { users: [], error: err instanceof Error ? err.message : "Couldn't load staff." };
    }
  }, []);

  if (!hasRole(user, ["owner", "admin"])) {
    return (
      <div>
        <ScreenHeader title="Staff" onBack={() => router.push("/settings")} />
        <PermissionDenied requiredRoles={["owner", "admin"]} />
      </div>
    );
  }

  if (result === undefined) {
    return (
      <div>
        <ScreenHeader title="Staff" onBack={() => router.push("/settings")} />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (result.error) {
    return (
      <div>
        <ScreenHeader title="Staff" onBack={() => router.push("/settings")} />
        <ErrorState message="Couldn't load staff." onRetry={() => window.location.reload()} />
      </div>
    );
  }

  const nonOwnerActiveCount = result.users.filter((u) => u.role !== "owner" && u.isActive).length;

  return (
    <div className="flex flex-col gap-4">
      <ScreenHeader title="Staff" onBack={() => router.push("/settings")} />

      <p className="text-[length:var(--font-size-label)] text-on-surface-muted">
        {nonOwnerActiveCount} of {STAFF_CAP} staff used
      </p>

      <div className="flex flex-col gap-2">
        {result.users.map((staffMember) => (
          <RippleButton
            key={staffMember.id}
            type="button"
            onClick={() => router.push(`/staff/${staffMember.id}`)}
            className="flex min-h-[var(--touch-target-min)] items-center justify-between gap-3 rounded-[var(--radius-card)] border border-border px-4 py-3 text-left hover:bg-surface-container transition-colors"
          >
            <div className="min-w-0">
              <p className="truncate text-[length:var(--font-size-body-lg)] text-on-surface">
                {staffMember.fullName}
                {!staffMember.isActive && (
                  <span className="ml-2 text-[length:var(--font-size-caption)] text-on-surface-muted">
                    (deactivated)
                  </span>
                )}
              </p>
              <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
                {ROLE_LABELS[staffMember.role] ?? staffMember.role}
              </p>
            </div>
            <ChevronRight size={20} className="shrink-0 text-on-surface-muted" aria-hidden />
          </RippleButton>
        ))}
      </div>

      {nonOwnerActiveCount < STAFF_CAP ? (
        <RippleButton
          type="button"
          onClick={() => router.push("/staff/new")}
          className="flex min-h-[var(--touch-target-min)] items-center justify-center gap-2 rounded-[var(--radius-control)] bg-brand-accent px-4 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast hover:opacity-95 transition-opacity"
        >
          <Plus size={18} aria-hidden />
          Add staff
        </RippleButton>
      ) : (
        <p className="rounded-[var(--radius-card)] bg-surface-container px-4 py-3 text-center text-[length:var(--font-size-body)] text-on-surface-muted">
          You&apos;ve reached the {STAFF_CAP}-staff limit. Deactivate someone to add another.
        </p>
      )}

      <RippleButton
        type="button"
        onClick={() => router.push("/staff/audit")}
        className="flex min-h-[var(--touch-target-min)] items-center justify-center gap-2 rounded-[var(--radius-control)] border border-border px-4 text-[length:var(--font-size-body)] text-on-surface hover:bg-surface-container transition-colors"
      >
        <ScrollText size={18} aria-hidden />
        View audit log
      </RippleButton>
    </div>
  );
}
