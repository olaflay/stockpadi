"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db, BUSINESS_PROFILE_SINGLETON_ID } from "@/lib/db";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { useToast } from "@/components/ui/Toast";
import { RippleButton } from "@/components/ui/Ripple";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { normalizeNigerianPhone } from "@/lib/whatsapp";

export default function SharingSettingsPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const { showToast } = useToast();
  const [whatsappInput, setWhatsappInput] = useState<string | null>(null);
  const profile = useLiveQuery(() => db.businessProfile.get(BUSINESS_PROFILE_SINGLETON_ID), []);

  if (user.accountType !== "BUSINESS_OWNER") {
    return (
      <div>
        <ScreenHeader title="Sharing" onBack={() => router.push("/settings")} />
        <PermissionDenied requiredAccountType="BUSINESS_OWNER" />
      </div>
    );
  }

  if (profile === undefined) {
    return (
      <div>
        <ScreenHeader title="Sharing" onBack={() => router.push("/settings")} />
        <Skeleton className="h-24" />
      </div>
    );
  }

  async function saveWhatsappNumber() {
    if (!profile) return;
    const raw = whatsappInput ?? "";
    if (raw.trim() === "") {
      await db.businessProfile.update(BUSINESS_PROFILE_SINGLETON_ID, { whatsappNumber: null });
      showToast("WhatsApp number cleared", "success");
      return;
    }
    const normalized = normalizeNigerianPhone(raw);
    if (!normalized) {
      showToast("That doesn't look like a valid Nigerian number.", "danger");
      return;
    }
    await db.businessProfile.update(BUSINESS_PROFILE_SINGLETON_ID, { whatsappNumber: normalized });
    showToast("WhatsApp number saved", "success");
  }

  return (
    <div className="flex flex-col gap-4">
      <ScreenHeader title="Sharing" onBack={() => router.push("/settings")} />

      <label className="flex flex-col gap-1">
        <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Your WhatsApp number</span>
        <p className="mb-1 text-[length:var(--font-size-caption)] text-on-surface-muted">
          Close-day summaries share straight to this number instead of asking you to pick a contact every time.
        </p>
        <div className="flex gap-2">
          <input
            type="tel"
            value={whatsappInput ?? profile?.whatsappNumber ?? ""}
            onChange={(event) => setWhatsappInput(event.target.value)}
            placeholder="e.g. 0803 123 4567"
            className="min-h-[var(--touch-target-min)] flex-1 rounded-[var(--radius-control)] border border-border bg-surface px-3 text-[length:var(--font-size-body)] text-on-surface"
          />
          <RippleButton
            type="button"
            onClick={saveWhatsappNumber}
            className="min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] bg-brand-accent px-4 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast hover:opacity-95 transition-opacity"
          >
            Save
          </RippleButton>
        </div>
      </label>
    </div>
  );
}
