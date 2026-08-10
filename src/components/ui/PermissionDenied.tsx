"use client";

import { useRouter } from "next/navigation";
import type { Role } from "@/types/roles";
import { RippleButton } from "@/components/ui/Ripple";

const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  manager: "Manager",
  cashier: "Cashier",
  inventory_staff: "Inventory Staff",
  accountant: "Accountant",
  admin: "Admin",
  super_admin: "Super Admin",
};

/**
 * States which role is required, not a bare "Access denied." Always offers
 * a way out — never a dead end a blocked role can only escape by hitting
 * the browser back button. See finding 3.1/#7 in docs/RESEARCH-AND-PLAN.md.
 */
export function PermissionDenied({ requiredRoles }: { requiredRoles: Role[] }) {
  const router = useRouter();
  const labels = requiredRoles.map((role) => ROLE_LABELS[role]);
  const roleList =
    labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;

  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-focus-block)] bg-surface-container px-6 py-14 text-center">
      <p className="text-[length:var(--font-size-body-lg)] font-medium text-on-surface">
        You don&apos;t have access to this screen
      </p>
      <p className="text-[length:var(--font-size-body)] text-on-surface-muted">
        Ask someone with the {roleList} role to make this change.
      </p>
      <RippleButton
        type="button"
        onClick={() => router.push("/dashboard")}
        className="mt-2 min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] bg-brand-accent px-5 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast hover:opacity-95 transition-opacity"
      >
        Go to Dashboard
      </RippleButton>
    </div>
  );
}
