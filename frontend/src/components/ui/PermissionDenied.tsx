"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
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
    <div
      role="status"
      className="flex flex-1 w-full max-w-md mx-auto flex-col justify-between my-auto rounded-2xl depth-card bg-surface-container-low border border-border/60 p-6 sm:p-7 overflow-hidden animate-step-in select-none"
    >
      <div className="flex flex-1 flex-col items-center justify-center text-center py-2 sm:py-4">
        <div className="mb-3.5 flex h-14 w-14 items-center justify-center rounded-full bg-warning/15 text-warning shrink-0 depth-bubble">
          <ShieldAlert size={26} aria-hidden />
        </div>

        <p className="text-base sm:text-lg font-bold text-on-surface leading-snug">
          You don&apos;t have access to this screen
        </p>

        <p className="mt-2 max-w-xs text-xs sm:text-sm text-on-surface-muted leading-relaxed">
          Ask someone with the <strong className="text-on-surface">{roleList}</strong> account type to make this change.
        </p>
      </div>

      <div className="flex w-full flex-col items-center gap-2 pt-4 mt-auto">
        <RippleButton
          type="button"
          onClick={() => router.push("/dashboard")}
          className="w-full min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] border border-brand-accent/50 bg-brand-accent/10 px-5 py-3 text-sm font-semibold text-brand-accent hover:bg-brand-accent/15 active:scale-[0.98] transition-all cursor-pointer shadow-xs"
        >
          Go to Dashboard
        </RippleButton>

        <Link
          href="/login"
          className="min-h-[var(--touch-target-min)] inline-flex items-center justify-center text-xs font-semibold text-on-surface-muted hover:text-on-surface transition-colors cursor-pointer"
        >
          Switch account
        </Link>
      </div>
    </div>
  );
}
