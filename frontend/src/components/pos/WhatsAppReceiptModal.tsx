"use client";

import { useState } from "react";
import { Copy, Check, MessageCircle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
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
 * A shareable customer copy of the recorded transaction. Account balances
 * deliberately do not appear here: they are live ledger values, not values
 * recorded on this sale.
 */
export function WhatsAppReceiptModal({
  sale,
  products,
  customer,
  businessName,
  onClose,
}: WhatsAppReceiptModalProps) {
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [copied, setCopied] = useState(false);

  const saleDate = new Date(sale.createdAtLocal);
  const dateStr = saleDate.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
  const receiptId = `REC-${saleDate.getFullYear()}-${sale.id.slice(0, 8).toUpperCase()}`;

  const lineItems = sale.items.map((item) => {
    const product = products.find((p) => p.id === item.productId);
    const total = item.quantity * item.unitPrice - item.discount;
    return `▸ ${item.quantity} ${item.unitLabel} × ${item.productNameSnapshot ?? product?.name ?? "Product name unavailable"}  ${formatCurrency(total)}`;
  });

  const paymentLine = sale.payments
    .map((p) => {
      const method =
        p.method === "cash"
          ? "Cash"
          : p.method === "transfer"
            ? "Bank Transfer"
            : p.method === "pos_terminal"
              ? "POS Terminal"
              : "Credit";
      let line = `  ${method}: ${formatCurrency(p.amount)}`;
      // Register drawer line + transfer audit note, matching the thermal
      // receipt (§9.1, §9.3).
      if (p.method === "cash" && p.tenderedAmount !== undefined) {
        line += `\n  Tendered: ${formatCurrency(p.tenderedAmount)} | Change: ${formatCurrency(p.tenderedAmount - p.amount)}`;
      }
      if (p.method === "transfer" && p.note) {
        line += `\n  ${p.note}`;
      }
      return line;
    })
    .join("\n");

  const previewText =
    `*${businessName}*\n` +
    `Receipt ${receiptId}\n` +
    `${dateStr}\n\n` +
    `${lineItems.join("\n")}\n\n` +
    `*TOTAL: ${formatCurrency(sale.total)}*\n\n` +
    `Payment:\n${paymentLine}` +
    `\n\nThank you for your business.`;

  function handleSend() {
    const trimmed = phone.trim();
    // No number saved/typed? buildWhatsAppUrl falls back to WhatsApp's own
    // contact picker with the text prefilled, so Send is never a dead end
    // (same intentional fallback documented in src/lib/whatsapp.ts).
    window.open(buildWhatsAppUrl(trimmed || null, previewText), "_blank");
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(previewText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Graceful fallback for environments without clipboard permissions
    }
  }

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Share Receipt"
      variant="sheet"
      maxWidth="max-w-md"
    >
      <div className="flex flex-col gap-3.5">
        {/* Phone number input */}
        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--font-size-label)] text-on-surface-muted font-medium">
            Customer WhatsApp number
          </span>
          <input
            type="tel"
            inputMode="numeric"
            placeholder="08012345678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] border border-border bg-surface px-3 text-sm text-on-surface shadow-[var(--shadow-recessed)] focus-visible:outline-none focus-visible:border-brand-accent focus-visible:ring-1 focus-visible:ring-brand-accent"
          />
        </label>

        {/* Receipt preview */}
        <div className="max-h-52 overflow-y-auto rounded-[var(--radius-card)] bg-surface-container p-3.5 shadow-[var(--shadow-recessed)] border border-border/30">
          <pre className="whitespace-pre-wrap text-xs leading-relaxed text-on-surface font-sans">
            {previewText}
          </pre>
        </div>

        {/* Actions: Copy fallback and Send via WhatsApp */}
        <div className="flex items-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={handleCopy}
            className="flex min-h-[var(--touch-target-min)] flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-border bg-surface px-3 text-xs sm:text-sm font-semibold text-on-surface hover:bg-surface-container active:scale-98 transition-all"
          >
            {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
            <span>{copied ? "Copied!" : "Copy text"}</span>
          </button>

          <RippleButton
            type="button"
            onClick={handleSend}
            className="flex min-h-[var(--touch-target-min)] flex-[2] items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[#25D366] px-4 text-xs sm:text-sm font-semibold text-white shadow-[var(--shadow-elevation-1)] hover:opacity-95 transition-opacity"
          >
            <MessageCircle size={16} aria-hidden />
            Send on WhatsApp
          </RippleButton>
        </div>
      </div>
    </Modal>
  );
}
