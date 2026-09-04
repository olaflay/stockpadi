/**
 * Nigerian standard thermal receipt for 58mm/80mm ESC-POS printers.
 * Structured per the blueprint spec: business header, line items,
 * payment breakdown, customer balance, and tear-off feed margins.
 *
 * The receipt is wrapped in #printable-thermal-receipt so the print
 * stylesheet in globals.css can isolate it from the rest of the page.
 */

import { formatCurrency } from "@/lib/format";
import type { Sale, SalePayment, SaleItem } from "@/types/sale";
import type { Product } from "@/types/product";
import type { LocalBusinessProfile, LocalCustomer } from "@/lib/db";

interface ThermalReceiptProps {
  sale: Sale;
  products: Product[];
  customer?: LocalCustomer | null;
  businessProfile?: LocalBusinessProfile | null;
  customerDebtBalance?: number;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: "CASH",
  transfer: "BANK TRANSFER",
  pos_terminal: "POS TERMINAL",
  credit: "CREDIT (ON ACCOUNT)",
};

const SEPARATOR = "========================================";
const THIN_SEP = "----------------------------------------";

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
      {/* Header */}
      <div className="text-center">
        <p className="font-bold text-sm">{businessName}</p>
        <p>{dateStr} · {timeStr}</p>
      </div>

      <div className="my-1 text-center">{SEPARATOR}</div>

      {/* Receipt ID */}
      <div className="flex justify-between">
        <span>{receiptId}</span>
        <span>{dateStr}</span>
      </div>
      {customer && (
        <div className="flex justify-between">
          <span>Customer: {customer.name}</span>
          {customer.phone && <span>{customer.phone}</span>}
        </div>
      )}

      <div className="my-1">{THIN_SEP}</div>

      {/* Line Items */}
      <div className="mb-1 flex justify-between text-[10px] font-bold uppercase">
        <span>QTY  ITEM</span>
        <span>PRICE  TOTAL</span>
      </div>
      <div>{THIN_SEP}</div>

      {sale.items.map((item, index) => {
        const product = products.find((p) => p.id === item.productId);
        const name = product?.name ?? "Item";
        const truncatedName = name.length > 24 ? name.slice(0, 22) + ".." : name;
        const lineTotal = item.quantity * item.unitPrice - item.discount;
        return (
          <div key={index} className="flex justify-between">
            <span>{item.quantity} {truncatedName}</span>
            <span>{formatCurrency(lineTotal)}</span>
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

      {/* Payment Breakdown */}
      <p className="font-bold">PAYMENT BREAKDOWN:</p>
      {sale.payments.map((payment: SalePayment, index: number) => (
        <div key={index} className="flex justify-between">
          <span>{PAYMENT_LABELS[payment.method] ?? payment.method.toUpperCase()}:</span>
          <span>{formatCurrency(payment.amount)}</span>
        </div>
      ))}

      {/* Customer Debt Summary */}
      {customer && customerDebtBalance !== undefined && customerDebtBalance > 0 && (
        <>
          <div className="my-1">{THIN_SEP}</div>
          <p className="font-bold">CUSTOMER ACCOUNT SUMMARY:</p>
          <div className="flex justify-between">
            <span>Current Balance Owed:</span>
            <span className="font-bold">{formatCurrency(customerDebtBalance)}</span>
          </div>
        </>
      )}

      <div className="my-2 text-center">{SEPARATOR}</div>

      {/* Footer */}
      <div className="text-center">
        <p>Thank you for your patronage!</p>
        <p className="text-[10px] mt-1">Powered by StockPadi</p>
      </div>

      {/* Tear-off feed margins: 4 blank lines so the printer's physical
          tear bar never slices through the footer text. */}
      <div aria-hidden className="h-[15mm]" />
    </div>
  );
}
