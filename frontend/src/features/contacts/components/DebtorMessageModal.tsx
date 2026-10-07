"use client";

import { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RippleButton } from "@/components/ui/Ripple";
import { db, BUSINESS_PROFILE_SINGLETON_ID } from "@/lib/db";
import { renderOwingMessage } from "@/lib/whatsapp";
import { useToast } from "@/components/ui/Toast";
import { serverPatch } from "@/platform/api/backend-client";

interface DebtorMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTemplate?: string;
  businessName: string;
}

const DEFAULT_TEMPLATE =
  "Hi {{customerName}}, gentle reminder from {{businessName}}. Your outstanding balance is {{amountOwed}}. Please pay when convenient. Thank you.";

function DebtorMessageForm({
  onClose,
  initialTemplate,
  businessName,
}: {
  onClose: () => void;
  initialTemplate: string;
  businessName: string;
}) {
  const { showToast } = useToast();
  const [template, setTemplate] = useState(initialTemplate);
  const [saving, setSaving] = useState(false);

  function insertTag(tag: string) {
    setTemplate((prev) => `${prev} ${tag}`);
  }

  async function handleSave() {
    const trimmed = template.trim();
    if (!trimmed) {
      showToast("Message template cannot be empty", "danger");
      return;
    }

    try {
      setSaving(true);
      // Save locally to Dexie IndexedDB immediately (works 100% offline)
      await db.businessProfile.update(BUSINESS_PROFILE_SINGLETON_ID, {
        owingMessageTemplate: trimmed,
      });

      // If connected to network, sync with backend
      if (typeof navigator !== "undefined" && navigator.onLine) {
        try {
          const profile = await db.businessProfile.get(BUSINESS_PROFILE_SINGLETON_ID);
          if (profile) {
            await serverPatch("/api/business/profile", {
              name: profile.name,
              businessTypeId: profile.businessTypeId,
              owingMessageTemplate: trimmed,
            });
          }
        } catch {
          // Non-blocking: local write is already saved
        }
      }

      showToast("Debtor reminder template saved", "success");
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save template", "danger");
    } finally {
      setSaving(false);
    }
  }

  // Live preview with sample debtor data
  const samplePreview = renderOwingMessage(template, {
    customerName: "Ada Okafor",
    businessName: businessName || "Your Store",
    amountOwed: "₦15,000",
  });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-on-surface-muted leading-relaxed">
        This message automatically loads when you send a WhatsApp reminder to any debtor. The name and debt amount are filled in automatically.
      </p>

      {/* Message Input Textarea */}
      <label className="flex flex-col gap-1.5">
        <span className="text-[length:var(--font-size-label)] font-medium text-on-surface">
          General Message Template
        </span>
        <textarea
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          rows={4}
          placeholder={DEFAULT_TEMPLATE}
          className="w-full rounded-2xl border border-border/40 bg-surface-container-low p-3.5 text-sm text-on-surface outline-none focus:ring-2 focus:ring-brand-accent/20 resize-none transition-all"
        />
      </label>

      {/* Tag Quick-Insert Chips */}
      <div>
        <span className="text-[11px] font-medium text-on-surface-muted">
          Tap to insert dynamic details:
        </span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => insertTag("{{customerName}}")}
            className="rounded-full bg-surface-container-high px-2.5 py-1 text-xs font-medium text-on-surface hover:bg-surface-container-highest transition-colors"
          >
            + Customer Name
          </button>
          <button
            type="button"
            onClick={() => insertTag("{{amountOwed}}")}
            className="rounded-full bg-surface-container-high px-2.5 py-1 text-xs font-medium text-on-surface hover:bg-surface-container-highest transition-colors"
          >
            + Amount Owed
          </button>
          <button
            type="button"
            onClick={() => insertTag("{{businessName}}")}
            className="rounded-full bg-surface-container-high px-2.5 py-1 text-xs font-medium text-on-surface hover:bg-surface-container-highest transition-colors"
          >
            + Store Name
          </button>
        </div>
      </div>

      {/* Live Preview Card */}
      <div className="rounded-2xl bg-surface-container p-3.5 border border-border/30">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-accent mb-1">
          <Sparkles size={14} />
          <span>Sample Live Preview</span>
        </div>
        <p className="text-xs text-on-surface italic bg-surface-container-low p-2.5 rounded-xl border border-border/20">
          &ldquo;{samplePreview}&rdquo;
        </p>
      </div>

      {/* Action Buttons */}
      <div className="mt-1 flex gap-2.5">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-xl bg-surface-container-high px-4 py-2.5 text-xs font-semibold text-on-surface hover:bg-surface-container-highest transition-colors"
        >
          Cancel
        </button>
        <RippleButton
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex-1 rounded-xl bg-brand-accent px-4 py-2.5 text-xs font-semibold text-brand-accent-contrast disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
        >
          <Check size={16} />
          <span>{saving ? "Saving..." : "Save Message"}</span>
        </RippleButton>
      </div>
    </div>
  );
}

export function DebtorMessageModal({
  isOpen,
  onClose,
  currentTemplate,
  businessName,
}: DebtorMessageModalProps) {
  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Customize Debtor Message">
      <DebtorMessageForm
        key={`${isOpen}-${currentTemplate}`}
        onClose={onClose}
        initialTemplate={currentTemplate?.trim() || DEFAULT_TEMPLATE}
        businessName={businessName}
      />
    </Modal>
  );
}
