"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db, BUSINESS_PROFILE_SINGLETON_ID } from "@/lib/db";
import { BUSINESS_TYPE_TEMPLATES } from "@/config/business-types";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { SelectInput } from "@/components/ui/SelectInput";
import { useToast } from "@/components/ui/Toast";
import { RippleButton } from "@/components/ui/Ripple";
import { useCurrentUser } from "@/features/auth/use-current-user";

const inputClass =
  "min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] border border-border bg-surface px-3 text-[length:var(--font-size-body)] text-on-surface";

export default function BusinessSettingsPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const { showToast } = useToast();
  const profile = useLiveQuery(() => db.businessProfile.get(BUSINESS_PROFILE_SINGLETON_ID), []);
  const [name, setName] = useState<string | null>(null);
  const [businessTypeId, setBusinessTypeId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (user.accountType !== "BUSINESS_OWNER") {
    return (
      <div>
        <ScreenHeader title="Business" onBack={() => router.push("/settings")} />
        <PermissionDenied requiredAccountType="BUSINESS_OWNER" />
      </div>
    );
  }

  if (profile === undefined) {
    return (
      <div>
        <ScreenHeader title="Business" onBack={() => router.push("/settings")} />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div>
        <ScreenHeader title="Business" onBack={() => router.push("/settings")} />
        <p className="text-center text-[length:var(--font-size-body)] text-on-surface-muted">
          Complete{" "}
          <a href="/onboarding" className="underline">
            onboarding
          </a>{" "}
          first.
        </p>
      </div>
    );
  }

  const hasChanges =
    (name !== null && name.trim() !== profile.name) ||
    (businessTypeId !== null && businessTypeId !== profile.businessTypeId);

  async function handleSave() {
    if (!profile) return;
    setIsSubmitting(true);
    try {
      await db.businessProfile.update(BUSINESS_PROFILE_SINGLETON_ID, {
        name: (name ?? profile.name).trim() || profile.name,
        businessTypeId: businessTypeId ?? profile.businessTypeId,
      });
      showToast("Business profile updated", "success");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ScreenHeader title="Business" onBack={() => router.push("/settings")} />


      <form id="business-settings-form" onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Business name</span>
          <input value={name ?? profile.name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Business type</span>
          <SelectInput value={businessTypeId ?? profile.businessTypeId} onChange={(e) => setBusinessTypeId(e.target.value)}>
            {BUSINESS_TYPE_TEMPLATES.map((template) => (
              <option key={template.id} value={template.id}>
                {template.label}
              </option>
            ))}
          </SelectInput>
        </label>
      </form>

      <div className="fixed bottom-0 left-0 right-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-surface border-t border-border z-[100] shadow-[var(--shadow-elevation-sticky-top)]">
        <RippleButton
          type="button"
          onClick={() => {
            const form = document.getElementById("business-settings-form") as HTMLFormElement;
            if (form) form.requestSubmit();
          }}
          disabled={!hasChanges || isSubmitting}
          className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-brand-accent px-5 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast disabled:opacity-50 hover:opacity-95 transition-opacity"
        >
          {isSubmitting ? "Saving…" : "Save changes"}
        </RippleButton>
      </div>
    </div>
  );
}
