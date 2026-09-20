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
import { renderOwingMessage } from "@/lib/whatsapp";
import { serverPatch } from "@/features/operations/server-client";

export default function SharingSettingsPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const { showToast } = useToast();
  const [whatsappInput, setWhatsappInput] = useState<string | null>(null);
  const [templateInput, setTemplateInput] = useState<string | null>(null);
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

  async function saveTemplate() {
    if (!profile) return;
    const template = (templateInput ?? profile.owingMessageTemplate ?? "").trim();
    if (!template) { showToast("Message template cannot be empty", "danger"); return; }
    if (!navigator.onLine) { showToast("Connect to the internet to save this template", "warning"); return; }
    try {
      const saved = await serverPatch<{ owing_message_template?: string }>("/api/business/profile", { name: profile.name, businessTypeId: profile.businessTypeId, owingMessageTemplate: template });
      await db.businessProfile.update(BUSINESS_PROFILE_SINGLETON_ID, { owingMessageTemplate: saved.owing_message_template ?? template });
      showToast("Owing message saved", "success");
    } catch (error) { showToast(error instanceof Error ? error.message : "Could not save message", "danger"); }
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
      <label className="flex flex-col gap-1">
        <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Owing message template</span>
        <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">Use {"{{customerName}}"}, {"{{businessName}}"}, and {"{{amountOwed}}"}.</p>
        <textarea value={templateInput ?? profile?.owingMessageTemplate ?? "Hi {{customerName}}, gentle reminder from {{businessName}}. Your balance is {{amountOwed}}. Please pay when convenient. Thank you."} onChange={(event) => setTemplateInput(event.target.value)} rows={4} className="rounded-[var(--radius-control)] border border-border bg-surface px-3 py-2 text-[length:var(--font-size-body)] text-on-surface" />
        <p className="rounded-[var(--radius-control)] bg-surface-container-low p-3 text-[length:var(--font-size-caption)] text-on-surface-muted">Preview: {renderOwingMessage(templateInput ?? profile?.owingMessageTemplate, { customerName: "Ada", businessName: profile?.name ?? "Your shop", amountOwed: "₦12,500" })}</p>
        <RippleButton type="button" onClick={saveTemplate} className="min-h-[var(--touch-target-min)] self-start rounded-[var(--radius-control)] bg-brand-accent px-4 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast">Save template</RippleButton>
      </label>
    </div>
  );
}
