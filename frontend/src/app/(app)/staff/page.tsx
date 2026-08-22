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
import { useCurrentUser } from "@/features/auth/use-current-user";
import { fetchStaff } from "@/features/auth/manage-staff-client";

/** "Up to 3 staff on top of the owner." docs/RESEARCH-AND-PLAN.md Section 4.2. */
export const STAFF_CAP = 3;

export default function StaffPage() {
  const router = useRouter();
  const user = useCurrentUser();

  const result = useLiveQuery(async () => {
    try {
      // Cached staff has no trusted tenant boundary. When the backend cannot
      // answer, show only the signed-in owner rather than risk rendering a
      // stale user from another business.
      const cached = (await db.localUsers.toArray()).filter((member) => member.id === user.id);
      let users = cached;
      try {
        const remote = await fetchStaff();
        users = remote.map((member) => ({
          id: member.id,
          fullName: member.fullName,
          accountType: member.accountType,
          isActive: member.isActive,
          updatedAt: new Date().toISOString(),
        }));
      } catch {
        // Cached staff is a display fallback only when the backend is unavailable.
      }
      users.sort((a, b) => (a.accountType === "BUSINESS_OWNER" ? -1 : b.accountType === "BUSINESS_OWNER" ? 1 : a.fullName.localeCompare(b.fullName)));
      return { users, error: null as string | null };
    } catch (err) {
      return { users: [], error: err instanceof Error ? err.message : "Couldn't load staff." };
    }
  }, []);

  if (user.accountType !== "BUSINESS_OWNER") {
    return (
      <div>
        <ScreenHeader title="Staff" onBack={() => router.push("/settings")} />
        <PermissionDenied requiredAccountType="BUSINESS_OWNER" />
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

  const nonOwnerActiveCount = result.users.filter((u) => u.accountType === "WORKER" && u.isActive).length;

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
                {staffMember.accountType === "BUSINESS_OWNER" ? "Business Owner" : "Worker"}
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
