import { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, ChevronRight, ScrollText } from "lucide-react";
import { db, type LocalUser } from "@/lib/db";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { RippleLink } from "@/components/ui/Ripple";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { fetchStaff } from "@/features/auth/manage-staff-client";
import { tenantArray } from "@/lib/local-tenant";

/** "Up to 3 staff on top of the owner." docs/RESEARCH-AND-PLAN.md Section 4.2. */
const STAFF_CAP = 3;

interface DisplayStaffMember {
  id: string;
  fullName: string;
  email?: string | null;
  accountType?: "ADMIN" | "BUSINESS_OWNER" | "WORKER" | string;
  isActive: boolean;
  deactivatedAt?: string | null;
  updatedAt?: string;
}

export default function StaffPage() {
  const user = useCurrentUser();
  const [remoteUsers, setRemoteUsers] = useState<DisplayStaffMember[] | null>(null);

  // 1. Instant local-first query (<5ms)
  const cachedUsers = useLiveQuery(async () => {
    try {
      const allUsers = await tenantArray<LocalUser>(db.localUsers);
      const filtered = allUsers.length > 0 ? allUsers : [{
        id: user.id,
        fullName: user.fullName,
        accountType: user.accountType,
        isActive: true,
        updatedAt: new Date().toISOString(),
      }];
      filtered.sort((a, b) =>
        a.accountType === "BUSINESS_OWNER"
          ? -1
          : b.accountType === "BUSINESS_OWNER"
          ? 1
          : a.fullName.localeCompare(b.fullName)
      );
      return filtered;
    } catch {
      return [{
        id: user.id,
        fullName: user.fullName,
        accountType: user.accountType,
        isActive: true,
        updatedAt: new Date().toISOString(),
      }];
    }
  }, [user.id, user.fullName, user.accountType]);

  // 2. Background remote sync (SWR pattern - never blocks page render)
  useEffect(() => {
    let cancelled = false;
    fetchStaff()
      .then((remote) => {
        if (cancelled) return;
        const mapped: DisplayStaffMember[] = remote.map((member) => ({
          id: member.id,
          fullName: member.fullName,
          email: member.email,
          accountType: member.accountType,
          isActive: member.isActive,
          deactivatedAt: member.deactivatedAt,
          updatedAt: new Date().toISOString(),
        }));
        mapped.sort((a, b) =>
          a.accountType === "BUSINESS_OWNER"
            ? -1
            : b.accountType === "BUSINESS_OWNER"
            ? 1
            : a.fullName.localeCompare(b.fullName)
        );
        setRemoteUsers(mapped);
      })
      .catch(() => {
        // Fallback to cached users if network fails or offline
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (user.accountType !== "BUSINESS_OWNER") {
    return (
      <div>
        <ScreenHeader title="Staff" backHref="/settings" />
        <PermissionDenied requiredAccountType="BUSINESS_OWNER" />
      </div>
    );
  }

  const staffList = remoteUsers ?? cachedUsers;

  if (staffList === undefined) {
    return (
      <div>
        <ScreenHeader title="Staff" backHref="/settings" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const nonOwnerActiveCount = staffList.filter((u) => u.accountType === "WORKER" && u.isActive).length;

  return (
    <div className="flex flex-col gap-4">
      <ScreenHeader title="Staff" backHref="/settings" />

      <p className="text-[length:var(--font-size-label)] text-on-surface-muted">
        {nonOwnerActiveCount} of {STAFF_CAP} staff used
      </p>

      <div className="divide-y divide-outline-variant/30 rounded-3xl bg-surface-container/60 border border-outline-variant/30 overflow-hidden shadow-xs">
        {staffList.map((staffMember) => (
          <RippleLink
            key={staffMember.id}
            href={`/staff/${staffMember.id}`}
            className="flex min-h-[var(--touch-target-min)] items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-surface-container-high/40 transition-colors"
          >
            <div className="min-w-0">
              <p className="truncate text-[length:var(--font-size-body-lg)] font-medium text-on-surface">
                {staffMember.fullName}
                {!staffMember.isActive && (
                  <span className="ml-2 text-[length:var(--font-size-caption)] text-on-surface-muted">
                    (deactivated)
                  </span>
                )}
              </p>
              <p className="text-[length:var(--font-size-caption)] text-on-surface-muted mt-0.5">
                {staffMember.accountType === "BUSINESS_OWNER" ? "Business Owner" : "Worker"}
              </p>
            </div>
            <ChevronRight size={18} className="shrink-0 text-on-surface-muted" aria-hidden />
          </RippleLink>
        ))}
      </div>

      {nonOwnerActiveCount < STAFF_CAP ? (
        <RippleLink
          href="/staff/new"
          className="flex min-h-[var(--touch-target-min)] items-center justify-center gap-2 rounded-[var(--radius-control)] bg-brand-accent px-4 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast hover:opacity-95 transition-opacity"
        >
          <Plus size={18} aria-hidden />
          Add staff
        </RippleLink>
      ) : (
        <p className="rounded-[var(--radius-card)] bg-surface-container px-4 py-3 text-center text-[length:var(--font-size-body)] text-on-surface-muted">
          You&apos;ve reached the {STAFF_CAP}-staff limit. Deactivate someone to add another.
        </p>
      )}

      <RippleLink
        href="/staff/audit"
        className="flex min-h-[var(--touch-target-min)] items-center justify-center gap-2 rounded-[var(--radius-control)] border border-border bg-surface px-4 text-[length:var(--font-size-body)] text-on-surface hover:bg-surface-container transition-colors"
      >
        <ScrollText size={18} aria-hidden />
        View audit log
      </RippleLink>
    </div>
  );
}
