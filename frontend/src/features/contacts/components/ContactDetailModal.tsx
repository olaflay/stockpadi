"use client";

import { useRouter } from "next/navigation";
import {
  Phone,
  MessageCircle,
  Clock,
  History,
  ShoppingCart,
  ExternalLink,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RippleButton } from "@/components/ui/Ripple";
import { formatCurrency } from "@/lib/format";
import { formatDisplayPhone } from "@/lib/phone";
import { buildWhatsAppUrl, renderOwingMessage } from "@/lib/whatsapp";
import { getAgingBucket } from "@/features/customers/credit";
import type { ContactRow } from "../contacts-filter";

interface ContactDetailModalProps {
  contact: ContactRow | null;
  isOpen: boolean;
  onClose: () => void;
  businessName: string;
  owingMessageTemplate?: string;
  onSendDebtorReminder?: (contact: ContactRow) => void;
}

export function ContactDetailModal({
  contact,
  isOpen,
  onClose,
  businessName,
  owingMessageTemplate,
  onSendDebtorReminder,
}: ContactDetailModalProps) {
  const router = useRouter();
  if (!contact) return null;

  const isDebtor = contact.balance > 0;
  const isCustomer = contact.kinds.includes("customer");
  const isSupplier = contact.kinds.includes("supplier");
  const aging = isDebtor && (contact.debtAgeDays ?? 0) >= 0 ? getAgingBucket(contact.debtAgeDays ?? 0) : null;

  function handleWhatsAppClick() {
    if (!contact?.phone) return;

    if (isDebtor && onSendDebtorReminder) {
      onClose();
      onSendDebtorReminder(contact);
      return;
    }

    let message: string;
    if (isDebtor) {
      message = renderOwingMessage(owingMessageTemplate, {
        customerName: contact.name,
        businessName,
        amountOwed: formatCurrency(contact.balance),
      });
    } else if (isSupplier) {
      message = `Hello ${contact.name}, this is ${businessName} reaching out regarding inventory supply.`;
    } else {
      message = `Hello ${contact.name}, thank you for choosing ${businessName}!`;
    }

    window.open(buildWhatsAppUrl(contact.phone, message), "_blank", "noopener,noreferrer");
  }

  function handleCallClick() {
    if (!contact?.phone) return;
    window.location.href = `tel:${contact.phone}`;
  }

  function handleGoToCustomerDetail() {
    if (!contact?.customerId) return;
    onClose();
    router.push(`/customers/${contact.customerId}`);
  }

  function handleGoToNewPurchase() {
    onClose();
    router.push("/purchases/new");
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Contact Details">
      <div className="flex flex-col gap-5">
        {/* Contact Identity Header */}
        <div className="flex items-center gap-3.5">
          <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-brand-container text-on-brand-container text-lg font-bold">
            {contact.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-bold text-on-surface">
              {contact.name}
            </h3>
            {contact.phone ? (
              <p className="text-xs text-on-surface-muted font-number mt-0.5">
                {formatDisplayPhone(contact.phone)}
              </p>
            ) : (
              <p className="text-xs text-on-surface-muted italic mt-0.5">
                No phone number recorded
              </p>
            )}

            {/* Badges */}
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {isCustomer && (
                <span className="inline-flex items-center rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] font-semibold text-on-surface">
                  Customer
                </span>
              )}
              {isSupplier && (
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  Supplier
                </span>
              )}
              {isDebtor && (
                <span className="inline-flex items-center rounded-full bg-danger/10 px-2 py-0.5 text-[10px] font-semibold text-danger">
                  Owing
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Debtor Highlights Banner */}
        {isDebtor && (
          <div className="rounded-2xl bg-danger-container/20 p-4 border border-danger/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-on-surface-muted">
                Outstanding Balance
              </span>
              {aging && (
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${aging.colorClass}`}>
                  <Clock size={12} />
                  <span>{aging.label}</span>
                </span>
              )}
            </div>
            <p className="mt-1 font-number text-2xl font-bold tabular-nums text-danger">
              {formatCurrency(contact.balance)}
            </p>
          </div>
        )}

        {/* Quick Contact Actions: WhatsApp & Call */}
        {contact.phone && (
          <div className="grid grid-cols-2 gap-2.5">
            <RippleButton
              type="button"
              onClick={handleWhatsAppClick}
              className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366]/15 px-3 py-2.5 text-xs font-semibold text-[#128C7E] hover:bg-[#25D366]/25 transition-all"
            >
              <MessageCircle size={16} className="text-[#25D366]" />
              <span>{isDebtor ? "WhatsApp Reminder" : "Chat WhatsApp"}</span>
            </RippleButton>

            <RippleButton
              type="button"
              onClick={handleCallClick}
              className="flex items-center justify-center gap-2 rounded-xl bg-surface-container-high px-3 py-2.5 text-xs font-semibold text-on-surface hover:bg-surface-container-highest transition-all"
            >
              <Phone size={16} className="text-on-surface-muted" />
              <span>Call Contact</span>
            </RippleButton>
          </div>
        )}

        {/* Secondary Navigation Actions */}
        <div className="flex flex-col gap-2 pt-1 border-t border-border/20">
          {contact.customerId && (
            <button
              type="button"
              onClick={handleGoToCustomerDetail}
              className="flex items-center justify-between rounded-xl bg-surface-container px-3.5 py-3 text-left hover:bg-surface-container-high transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <History size={16} className="text-brand-accent" />
                <span className="text-xs font-semibold text-on-surface">
                  {isDebtor ? "View Ledger & Record Repayment" : "View Customer History"}
                </span>
              </div>
              <ExternalLink size={14} className="text-on-surface-muted" />
            </button>
          )}

          {isSupplier && (
            <button
              type="button"
              onClick={handleGoToNewPurchase}
              className="flex items-center justify-between rounded-xl bg-surface-container px-3.5 py-3 text-left hover:bg-surface-container-high transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <ShoppingCart size={16} className="text-primary" />
                <span className="text-xs font-semibold text-on-surface">
                  New Purchase from Supplier
                </span>
              </div>
              <ExternalLink size={14} className="text-on-surface-muted" />
            </button>
          )}
        </div>

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl bg-surface-container-high py-2.5 text-xs font-semibold text-on-surface hover:bg-surface-container-highest transition-colors"
        >
          Close
        </button>
      </div>
    </Modal>
  );
}
