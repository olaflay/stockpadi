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
      className="flex flex-col items-center justify-center text-center animate-step-in w-full max-w-sm mx-auto px-6 py-8 rounded-[var(--radius-focus-block)] bg-surface-container my-auto"
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-warning/15 text-warning shrink-0">
        <ShieldAlert size={28} aria-hidden />
      </div>

      <p className="text-[length:var(--font-size-title-lg)] font-bold text-on-surface leading-snug">
        You don&apos;t have access to this screen
      </p>

      <p className="mt-1.5 max-w-xs text-[length:var(--font-size-body)] text-on-surface-muted leading-relaxed">
        Ask someone with the <strong className="text-on-surface">{roleList}</strong> account type to make this change.
      </p>

      <div className="mt-5 flex flex-col items-center gap-2 w-full max-w-xs">
        <RippleButton
          type="button"
          onClick={() => router.push("/dashboard")}
          className="w-full min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] bg-brand-accent px-5 py-2.5 text-[length:var(--font-size-body)] font-semibold text-brand-accent-contrast shadow-[var(--shadow-elevation-1)] hover:opacity-95 transition-opacity"
        >
          Go to Dashboard
        </RippleButton>

        <Link
          href="/login"
          className="min-h-[var(--touch-target-min)] inline-flex items-center justify-center text-xs font-semibold text-on-surface-muted hover:text-on-surface transition-colors"
        >
          Switch account
        </Link>
      </div>
    </div>
  );
}
