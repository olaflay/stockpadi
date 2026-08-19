"use client";

import { useRouter } from "next/navigation";
import type { AccountType } from "@/features/auth/authorization";
import { RippleButton } from "@/components/ui/Ripple";

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  ADMIN: "Admin",
  BUSINESS_OWNER: "Business Owner",
  WORKER: "Worker",
};

export function PermissionDenied({ requiredAccountTypes, requiredAccountType }: { requiredAccountTypes?: readonly AccountType[]; requiredAccountType?: AccountType }) {
  const router = useRouter();
  const labels: string[] = [];
  if (requiredAccountTypes) {
    labels.push(...requiredAccountTypes.map((accountType) => ACCOUNT_TYPE_LABELS[accountType]));
  }
  if (requiredAccountType) {
    labels.push(ACCOUNT_TYPE_LABELS[requiredAccountType]);
  }
  const roleList =
    labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;

  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-focus-block)] bg-surface-container px-6 py-14 text-center">
      <p className="text-[length:var(--font-size-body-lg)] font-medium text-on-surface">
        You don&apos;t have access to this screen
      </p>
      <p className="text-[length:var(--font-size-body)] text-on-surface-muted">
        Ask someone with the {roleList} account type to make this change.
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
