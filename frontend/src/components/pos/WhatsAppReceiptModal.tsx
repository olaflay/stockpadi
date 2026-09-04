"use client";

import { useState } from "react";
import { Copy, Check, MessageCircle, X } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { RippleButton } from "@/components/ui/Ripple";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { formatCurrency } from "@/lib/format";
import { getCustomerCreditBalance } from "@/features/customers/credit";
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
 * with a live phone number field, customer credit debt balance integration,
 * reminder toggle, and one-tap send/copy.
 */
export function WhatsAppReceiptModal({
  sale,
  products,
  customer,
  businessName,
  onClose,
}: WhatsAppReceiptModalProps) {
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [includeDebt, setIncludeDebt] = useState(true);
  const [copied, setCopied] = useState(false);

  // Live debt balance for linked customer
  const customerDebtBalance = useLiveQuery(
    async () => {
      if (!customer?.id) return 0;
      const bal = await getCustomerCreditBalance(customer.id);
      return Math.max(bal, 0);
    },
    [customer?.id],
    0
  );

  const saleDate = new Date(sale.createdAtLocal);
  const dateStr = saleDate.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
  const receiptId = `REC-${saleDate.getFullYear()}-${sale.id.slice(0, 8).toUpperCase()}`;

  const lineItems = sale.items.map((item) => {
    const product = products.find((p) => p.id === item.productId);
    const total = item.quantity * item.unitPrice - item.discount;
    return `▸ ${item.quantity} ${item.unitLabel} × ${product?.name ?? "Item"}  ${formatCurrency(total)}`;
  });

  const paymentLine = sale.payments
    .map((p) => {
      const method =
        p.method === "cash"
          ? "💵 Cash"
          : p.method === "transfer"
            ? "🏦 Transfer"
            : p.method === "pos_terminal"
              ? "📱 POS"
              : "📋 Credit";
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

  const debtSummarySection =
    includeDebt && customerDebtBalance > 0
      ? `\n\n━━━━━━━━━━━━━━━━━━━━━━\n⚠️ *CUSTOMER ACCOUNT SUMMARY:*\nOutstanding Balance: *${formatCurrency(customerDebtBalance)}*`
      : "";

  const previewText =
    `*${businessName}*\n` +
    `Receipt ${receiptId}\n` +
    `${dateStr}\n\n` +
    `${lineItems.join("\n")}\n\n` +
    `*TOTAL: ${formatCurrency(sale.total)}*\n\n` +
    `Payment:\n${paymentLine}` +
    `${debtSummarySection}\n\n` +
    `Thank you for your patronage! 🙏\n` +
    `Powered by StockPadi`;

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

        {/* Customer debt alert banner with toggle */}
        {customerDebtBalance > 0 && (
          <div className="mb-3 rounded-[var(--radius-control)] border border-warning/40 bg-warning-container/30 p-2.5 text-xs text-on-warning-container">
            <p className="font-semibold text-warning">
              ⚠️ Customer has an outstanding balance of {formatCurrency(customerDebtBalance)}
            </p>
            <label className="mt-1.5 flex items-center gap-2 cursor-pointer font-medium select-none text-on-surface">
              <input
                type="checkbox"
                checked={includeDebt}
                onChange={(e) => setIncludeDebt(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border accent-brand-accent"
              />
              <span>Include balance reminder in message</span>
            </label>
          </div>
        )}

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
            className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] border border-border bg-surface px-3 text-[length:var(--font-size-body)] text-on-surface focus-visible:outline-none focus-visible:border-brand-accent focus-visible:ring-1 focus-visible:ring-brand-accent"
          />
        </label>

        {/* Receipt preview */}
        <div className="mb-4 max-h-56 overflow-y-auto rounded-[var(--radius-card)] bg-surface-container p-3">
          <pre className="whitespace-pre-wrap text-[length:var(--font-size-caption)] leading-relaxed text-on-surface font-sans">
            {previewText}
          </pre>
        </div>

        {/* Actions: Copy fallback and Send via WhatsApp */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="flex min-h-[var(--touch-target-min)] flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-border bg-surface px-3 text-xs font-semibold text-on-surface hover:bg-surface-container transition-colors"
          >
            {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
            <span>{copied ? "Copied!" : "Copy text"}</span>
          </button>

<RippleButton
            type="button"
            onClick={handleSend}
            className="flex min-h-[var(--touch-target-min)] flex-[2] items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[#25D366] px-4 text-xs font-semibold text-white hover:opacity-95 transition-opacity"
          >
            <MessageCircle size={16} aria-hidden />
            Send on WhatsApp
          </RippleButton>
        </div>
      </div>
    </div>
  );
}
