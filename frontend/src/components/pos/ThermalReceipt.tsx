/**
 * Nigerian standard thermal receipt for 58mm/80mm ESC-POS printers.
 * Same sections, order, and wording as the WhatsApp receipt preview so the
 * printed copy and the shared copy read as one "standard receipt" (§10.6).
 *
 * 58mm constraints (printable width ~48mm at 11px monospace ≈ 32 columns):
 * - ASCII-safe text only (no emoji, "▸"/"×" → "x") so old ESC-POS low-end
 *   printers render every glyph;
 * - item totals stay on their own right-aligned column; long product names
 *   wrap to a second line instead of pushing the total off the paper.
 *
 * The receipt is wrapped in #printable-thermal-receipt so the print
 * stylesheet in globals.css can isolate it from the rest of the page.
 */

import { formatCurrency } from "@/lib/format";
import type { Sale } from "@/types/sale";
import type { Product } from "@/types/product";
import type { LocalBusinessProfile, LocalCustomer } from "@/lib/db";

interface ThermalReceiptProps {
  sale: Sale;
  products: Product[];
  customer?: LocalCustomer | null;
  businessProfile?: LocalBusinessProfile | null;
  customerDebtBalance?: number;
}

/** Method labels match the WhatsApp receipt (emoji stripped for printing). */
const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  transfer: "Bank Transfer",
  pos_terminal: "POS",
  credit: "Credit",
};

/** 32-column separators so they never wrap on a 58mm roll. */
const SEPARATOR = "================================";
const THIN_SEP = "--------------------------------";

/** Printable columns on a 58mm roll at 11px monospace (~48mm / ~1.5mm char). */
const PRINT_WIDTH = 32;

export function ThermalReceipt({
  sale,
  products,
  customer,
  businessProfile,
  customerDebtBalance,
}: ThermalReceiptProps) {
  const businessName = businessProfile?.name ?? "Receipt";
  const saleDate = new Date(sale.createdAtLocal);
  const dateStr = saleDate.toLocaleDateString("en-NG", { dateStyle: "medium" });
  const timeStr = saleDate.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" });
  const receiptId = `REC-${saleDate.getFullYear()}-${sale.id.slice(0, 8).toUpperCase()}`;

  return (
    <div id="printable-thermal-receipt" className="font-mono text-[11px] leading-[1.25] text-black bg-white">
      {/* Header — same first lines as the WhatsApp receipt */}
      <div className="text-center">
        <p className="font-bold text-sm">{businessName}</p>
        <p>Receipt {receiptId}</p>
        <p>{dateStr}, {timeStr}</p>
      </div>

      {customer && (
        <div className="mt-1 text-center">
          <p>Customer: {customer.name}</p>
          {customer.phone && <p>Tel: {customer.phone}</p>}
        </div>
      )}

      <div className="my-1 text-center">{THIN_SEP}</div>

      {/* Line items — "qty unit x name" with the total right-aligned; a name
          that would overflow the 32-column grid wraps to its own line. */}
      {sale.items.map((item, index) => {
        const product = products.find((p) => p.id === item.productId);
        const name = product?.name ?? "Item";
        const prefix = `${item.quantity} ${item.unitLabel} x `;
        const lineTotal = item.quantity * item.unitPrice - item.discount;
        const totalText = formatCurrency(lineTotal);
        const fitsOnLine = prefix.length + name.length + totalText.length + 1 <= PRINT_WIDTH;
        return fitsOnLine ? (
          <div key={index} className="flex justify-between">
            <span>{prefix}{name}</span>
            <span>{totalText}</span>
          </div>
        ) : (
          <div key={index}>
            <div className="flex justify-between">
              <span>{prefix}</span>
              <span>{totalText}</span>
            </div>
            <div>{name}</div>
          </div>
        );
      })}

      <div className="my-1">{THIN_SEP}</div>

      {/* Totals */}
      <div className="flex justify-between font-bold">
        <span>SUBTOTAL:</span>
        <span>{formatCurrency(sale.subtotal)}</span>
      </div>
      {sale.discount > 0 && (
        <div className="flex justify-between">
          <span>DISCOUNT:</span>
          <span>-{formatCurrency(sale.discount)}</span>
        </div>
      )}
      <div className="flex justify-between font-bold text-sm">
        <span>TOTAL:</span>
        <span>{formatCurrency(sale.total)}</span>
      </div>

      <div className="my-1">{THIN_SEP}</div>

      {/* Payment breakdown — same heading and method labels as WhatsApp */}
      <p className="font-bold">Payment:</p>
      {sale.payments.map((payment, index) => (
        <div key={index}>
          <div className="flex justify-between">
            <span>{PAYMENT_LABELS[payment.method] ?? payment.method.toUpperCase()}:</span>
            <span>{formatCurrency(payment.amount)}</span>
          </div>
          {/* Register drawer line: Tendered/Change from the cash the customer
              actually handed over, not the recorded sale portion (§9.1). */}
          {payment.method === "cash" && payment.tenderedAmount !== undefined && (
            <>
              <div className="flex justify-between">
                <span>Tendered:</span>
                <span>{formatCurrency(payment.tenderedAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span>Change:</span>
                <span>{formatCurrency(payment.tenderedAmount - payment.amount)}</span>
              </div>
            </>
          )}
          {/* Transfer audit note printed for the end-of-day cross-check with
              the bank app (§9.3). */}
          {payment.method === "transfer" && payment.note && (
            <div>{payment.note}</div>
          )}
        </div>
      ))}

      {/* Customer Debt Summary */}
      {customer && customerDebtBalance !== undefined && customerDebtBalance > 0 && (
        <>
          <div className="my-1">{THIN_SEP}</div>
          <p className="font-bold">CUSTOMER ACCOUNT SUMMARY:</p>
          <div className="flex justify-between">
            <span>Outstanding Balance:</span>
            <span className="font-bold">{formatCurrency(customerDebtBalance)}</span>
          </div>
        </>
      )}

      <div className="my-2 text-center">{SEPARATOR}</div>

      {/* Footer */}
      <div className="text-center">
        <p>Thank you for your patronage!</p>
        <p className="text-xs mt-1">Powered by StockPadi</p>
      </div>

      {/* Tear-off feed margins: 4 blank lines so the printer's physical
          tear bar never slices through the footer text. */}
      <div aria-hidden style={{ height: "15mm" }} />
    </div>
  );
}