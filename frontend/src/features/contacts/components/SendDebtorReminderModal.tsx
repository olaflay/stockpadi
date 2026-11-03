"use client";

import { useState } from "react";
import { Send, Edit3, Check, Copy } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RippleButton } from "@/components/ui/Ripple";
import { formatCurrency } from "@/lib/format";
import { formatDisplayPhone } from "@/lib/phone";
import { buildWhatsAppUrl, renderOwingMessage } from "@/lib/whatsapp";
import { useToast } from "@/components/ui/Toast";
import type { ContactRow } from "../contacts-filter";

interface SendDebtorReminderModalProps {
  contact: ContactRow | null;
  isOpen: boolean;
  onClose: () => void;
  businessName: string;
  template?: string;
  onOpenTemplateEditor?: () => void;
}

function SendDebtorReminderForm({
  contact,
  onClose,
  initialMessage,
  onOpenTemplateEditor,
}: {
  contact: ContactRow;
  onClose: () => void;
  initialMessage: string;
  onOpenTemplateEditor?: () => void;
}) {
  const [customMessage, setCustomMessage] = useState(initialMessage);
  const [copied, setCopied] = useState(false);
  const { showToast } = useToast();

  function handleSend() {
    if (!contact.phone) return;
    const url = buildWhatsAppUrl(contact.phone, customMessage);
    window.open(url, "_blank", "noopener,noreferrer");
    onClose();
  }

  async function handleCopy() {
    if (!customMessage.trim()) return;
    try {
      await navigator.clipboard.writeText(customMessage.trim());
      setCopied(true);
      showToast("Reminder copied", "success");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("Could not copy the reminder", "danger");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Current ledger summary, intentionally separate from a sale receipt. */}
      <div className="flex items-center justify-between rounded-2xl bg-credit-container p-3.5 border border-credit/20">
        <div>
          <p className="text-sm font-bold text-on-credit-container">{contact.name}</p>
          <p className="text-xs text-on-credit-container/80 font-number mt-0.5">
            {contact.phone ? formatDisplayPhone(contact.phone) : "No phone recorded"}
          </p>
        </div>
        <div className="text-right">
          <span className="text-[length:var(--font-size-caption)] text-on-credit-container/80 block">Current balance</span>
          <span className="font-number text-lg font-bold tabular-nums text-on-credit-container">
            {formatCurrency(contact.balance)}
          </span>
        </div>
      </div>

      {!contact.phone && (
        <p className="rounded-[var(--radius-control)] border border-warning/30 bg-warning-container/30 p-3 text-[length:var(--font-size-caption)] text-on-surface">
          Add a phone number to this contact before sending a WhatsApp reminder.
        </p>
      )}

      {/* Message Editor */}
      <label className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[length:var(--font-size-label)] font-medium text-on-surface">
            Payment reminder
          </span>
          {onOpenTemplateEditor && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenTemplateEditor();
              }}
              className="inline-flex items-center gap-1 text-[length:var(--font-size-caption)] text-brand-accent hover:underline"
            >
              <Edit3 size={12} />
              <span>Edit General Template</span>
            </button>
          )}
        </div>
        <textarea
          value={customMessage}
          onChange={(e) => setCustomMessage(e.target.value)}
          rows={4}
          className="w-full rounded-2xl border border-border/40 bg-surface-container-low p-3.5 text-sm text-on-surface outline-none focus:ring-2 focus:ring-brand-accent/20 resize-none transition-all"
        />
        <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
          This is a current balance reminder, not a receipt. You can add payment instructions before sending.
        </p>
      </label>

      {/* Send Action */}
      <div className="mt-1 flex gap-2.5">
        <button
          type="button"
          onClick={onClose}
          className="min-h-[var(--touch-target-min)] flex-1 rounded-[var(--radius-control)] bg-surface-container-high px-4 py-2.5 text-xs font-semibold text-on-surface hover:bg-surface-container-highest transition-colors"
        >
          Cancel
        </button>
        <RippleButton
          type="button"
          onClick={handleCopy}
          disabled={!customMessage.trim()}
          aria-label="Copy payment reminder"
          className="flex min-h-[var(--touch-target-min)] min-w-[var(--touch-target-min)] items-center justify-center rounded-[var(--radius-control)] border border-border bg-surface px-3 text-on-surface disabled:opacity-50"
        >
          {copied ? <Check size={17} aria-hidden /> : <Copy size={17} aria-hidden />}
        </RippleButton>
        <RippleButton
          type="button"
          onClick={handleSend}
          disabled={!contact.phone || !customMessage.trim()}
          className="flex min-h-[var(--touch-target-min)] flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-control)] bg-[#25D366] px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-[#20ba59] active:scale-95 disabled:opacity-50 transition-all"
        >
          <Send size={15} />
          <span>Send on WhatsApp</span>
        </RippleButton>
      </div>
    </div>
  );
}

export function SendDebtorReminderModal({
  contact,
  isOpen,
  onClose,
  businessName,
  template,
  onOpenTemplateEditor,
}: SendDebtorReminderModalProps) {
  if (!isOpen || !contact) return null;

  const initialMessage = renderOwingMessage(template, {
    customerName: contact.name,
    businessName: businessName || "Our Store",
    amountOwed: formatCurrency(contact.balance),
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Send payment reminder" variant="sheet" maxWidth="max-w-md">
      <SendDebtorReminderForm
        key={`${contact.id}-${isOpen}`}
        contact={contact}
        onClose={onClose}
        initialMessage={initialMessage}
        onOpenTemplateEditor={onOpenTemplateEditor}
      />
    </Modal>
  );
}
