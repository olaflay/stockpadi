"use client";

import { useState } from "react";
import { Send, Edit3 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RippleButton } from "@/components/ui/Ripple";
import { formatCurrency } from "@/lib/format";
import { formatDisplayPhone } from "@/lib/phone";
import { buildWhatsAppUrl, renderOwingMessage } from "@/lib/whatsapp";
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

  function handleSend() {
    if (!contact.phone) return;
    const url = buildWhatsAppUrl(contact.phone, customMessage);
    window.open(url, "_blank", "noopener,noreferrer");
    onClose();
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Debtor Summary Card */}
      <div className="flex items-center justify-between rounded-2xl bg-danger-container/20 p-3.5 border border-danger/20">
        <div>
          <p className="text-sm font-bold text-on-surface">{contact.name}</p>
          <p className="text-xs text-on-surface-muted font-number mt-0.5">
            {contact.phone ? formatDisplayPhone(contact.phone) : "No phone recorded"}
          </p>
        </div>
        <div className="text-right">
          <span className="text-[11px] text-on-surface-muted block">Amount Owed</span>
          <span className="font-number text-lg font-bold tabular-nums text-danger">
            {formatCurrency(contact.balance)}
          </span>
        </div>
      </div>

      {/* Message Editor */}
      <label className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[length:var(--font-size-label)] font-medium text-on-surface">
            Message to Send
          </span>
          {onOpenTemplateEditor && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenTemplateEditor();
              }}
              className="inline-flex items-center gap-1 text-[11px] text-brand-accent hover:underline"
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
        <p className="text-[11px] text-on-surface-muted">
          You can edit this message before sending (e.g. to add your bank details).
        </p>
      </label>

      {/* Send Action */}
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
          onClick={handleSend}
          disabled={!contact.phone || !customMessage.trim()}
          className="flex-1 rounded-xl bg-[#25D366] px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-[#20ba59] active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
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
    <Modal isOpen={isOpen} onClose={onClose} title="Send Debtor Reminder">
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
