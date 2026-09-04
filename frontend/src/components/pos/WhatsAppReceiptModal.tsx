"use client";

import { useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { RippleButton } from "@/components/ui/Ripple";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { formatCurrency } from "@/lib/format";
import type { Sale } from "@/types/sale";
import type { Product } from "@/types/product";
import type { LocalCustomer } from "@/lib/db";

interface WhatsAppReceiptModalProps {
  sale: Sale;
  products: Product[];
  customer?: LocalCustomer | null;
  businessName: string;
  onClose: () => void;
}

/**
 * WhatsApp receipt preview modal: shows the formatted receipt text
 * with a live phone number field and one-tap send. Replaces the
 * broken window.alert flow in the sales detail page.
 */
export function WhatsAppReceiptModal({
  sale,
  products,
  customer,
  businessName,
  onClose,
}: WhatsAppReceiptModalProps) {
  const [phone, setPhone] = useState(customer?.phone ?? "");

  const saleDate = new Date(sale.createdAtLocal);
  const dateStr = saleDate.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
  const receiptId = `REC-${saleDate.getFullYear()}-${sale.id.slice(0, 8).toUpperCase()}`;

  const lineItems = sale.items.map((item) => {
    const product = products.find((p) => p.id === item.productId);
    const total = item.quantity * item.unitPrice - item.discount;
    return `▸ ${item.quantity} ${item.unitLabel} × ${product?.name ?? "Item"}  ${formatCurrency(total)}`;
  });

  const paymentLine = sale.payments
    .map((p) => `  ${p.method === "cash" ? "💵 Cash" : p.method === "transfer" ? "🏦 Transfer" : p.method === "pos_terminal" ? "📱 POS" : "📋 Credit"}: ${formatCurrency(p.amount)}`)
    .join("\n");

  const previewText =
    `*${businessName}*\n` +
    `Receipt ${receiptId}\n` +
    `${dateStr}\n\n` +
    `${lineItems.join("\n")}\n\n` +
    `*TOTAL: ${formatCurrency(sale.total)}*\n\n` +
    `Payment:\n${paymentLine}\n\n` +
    `Thank you for your patronage! 🙏\n` +
    `Powered by StockPadi`;

  function handleSend() {
    const trimmed = phone.trim();
    if (!trimmed) return;
    window.open(buildWhatsAppUrl(trimmed, previewText), "_blank");
  }

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-end justify-center bg-black/40 sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Share receipt on WhatsApp"
        className="w-full max-w-md rounded-t-[var(--radius-sheet)] bg-surface p-5 shadow-elevated animate-sheet-in sm:rounded-[var(--radius-card)]"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[length:var(--font-size-title-md)] font-semibold text-on-surface">
            Share receipt
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-muted hover:bg-surface-container"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Phone number input */}
        <label className="mb-3 block">
          <span className="mb-1 block text-[length:var(--font-size-label)] text-on-surface-muted">
            Customer WhatsApp number
          </span>
          <input
            type="tel"
            inputMode="numeric"
            placeholder="08012345678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] border border-border bg-surface px-3 text-[length:var(--font-size-body)] text-on-surface"
          />
        </label>

        {/* Receipt preview */}
        <div className="mb-4 max-h-60 overflow-y-auto rounded-[var(--radius-card)] bg-surface-container p-3">
          <pre className="whitespace-pre-wrap text-[length:var(--font-size-caption)] leading-relaxed text-on-surface">
            {previewText}
          </pre>
        </div>

        <RippleButton
          type="button"
          onClick={handleSend}
          disabled={!phone.trim()}
          className="flex min-h-[var(--touch-target-min)] w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[#25D366] px-5 text-[length:var(--font-size-body)] font-medium text-white hover:opacity-95 disabled:opacity-50 transition-opacity"
        >
          <MessageCircle size={18} aria-hidden />
          Send on WhatsApp
        </RippleButton>
      </div>
    </div>
  );
}
