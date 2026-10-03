import jsPDF from "jspdf";
import { formatCurrency } from "@/lib/format";

export interface ReceiptItemData {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface ReceiptPdfData {
  businessName: string;
  branchName?: string;
  phone?: string;
  address?: string;
  receiptNumber: string;
  dateStr: string;
  cashierName?: string;
  customerName?: string;
  customerPhone?: string;
  items: ReceiptItemData[];
  subtotal: number;
  discount: number;
  total: number;
  payments: Array<{
    method: string;
    amount: number;
  }>;
  footerNote?: string;
}

/**
 * Generates an official, standard retail receipt in PDF format.
 * Designed to look clean, professional, and readable on mobile devices and printers
 * without including any application UI or browser headers.
 */
export function generateReceiptPdf(data: ReceiptPdfData): jsPDF {
  // 80mm width thermal / POS slip format, with dynamic height based on item rows
  const pageWidth = 80;
  const estimatedHeight = Math.max(160, 100 + data.items.length * 10 + (data.payments.length * 7));
  
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [pageWidth, estimatedHeight],
  });

  const margin = 5;
  const contentWidth = pageWidth - margin * 2;
  let y = 8;

  // Header - Business Name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(data.businessName || "SALES RECEIPT", pageWidth / 2, y, { align: "center" });
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  if (data.branchName) {
    doc.text(data.branchName, pageWidth / 2, y, { align: "center" });
    y += 4;
  }

  if (data.address) {
    doc.text(data.address, pageWidth / 2, y, { align: "center" });
    y += 4;
  }

  if (data.phone) {
    doc.text(`Tel: ${data.phone}`, pageWidth / 2, y, { align: "center" });
    y += 4;
  }

  // Divider
  y += 1;
  doc.setLineWidth(0.2);
  doc.setDrawColor(180, 180, 180);
  doc.line(margin, y, pageWidth - margin, y);
  y += 4;

  // Receipt Meta
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.text(`Receipt: #${data.receiptNumber}`, margin, y);
  y += 3.8;

  doc.setFont("helvetica", "normal");
  doc.text(`Date: ${data.dateStr}`, margin, y);
  y += 3.8;

  if (data.cashierName) {
    doc.text(`Cashier: ${data.cashierName}`, margin, y);
    y += 3.8;
  }

  if (data.customerName) {
    doc.text(`Customer: ${data.customerName}${data.customerPhone ? ` (${data.customerPhone})` : ""}`, margin, y);
    y += 3.8;
  }

  // Items Header Table
  y += 1;
  doc.line(margin, y, pageWidth - margin, y);
  y += 3.5;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("Item", margin, y);
  doc.text("Qty", margin + 35, y, { align: "right" });
  doc.text("Price", margin + 52, y, { align: "right" });
  doc.text("Total", pageWidth - margin, y, { align: "right" });
  y += 2.5;

  doc.line(margin, y, pageWidth - margin, y);
  y += 4;

  // Items List
  doc.setFont("helvetica", "normal");
  for (const item of data.items) {
    const itemName = item.name.length > 22 ? `${item.name.slice(0, 21)}…` : item.name;
    doc.text(itemName, margin, y);
    doc.text(String(item.quantity), margin + 35, y, { align: "right" });
    doc.text(formatCurrency(item.unitPrice), margin + 52, y, { align: "right" });
    doc.text(formatCurrency(item.total), pageWidth - margin, y, { align: "right" });
    y += 4.5;
  }

  // Totals Section
  y += 1;
  doc.line(margin, y, pageWidth - margin, y);
  y += 4;

  doc.setFontSize(7.5);
  doc.text("Subtotal:", margin + 35, y);
  doc.text(formatCurrency(data.subtotal), pageWidth - margin, y, { align: "right" });
  y += 3.8;

  if (data.discount > 0) {
    doc.text("Discount:", margin + 35, y);
    doc.text(`-${formatCurrency(data.discount)}`, pageWidth - margin, y, { align: "right" });
    y += 3.8;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("TOTAL:", margin + 35, y);
  doc.text(formatCurrency(data.total), pageWidth - margin, y, { align: "right" });
  y += 5;

  // Payments breakdown
  doc.line(margin, y, pageWidth - margin, y);
  y += 3.5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text("Payment Breakdown:", margin, y);
  y += 3.5;

  for (const p of data.payments) {
    const methodLabel =
      p.method === "cash"
        ? "Cash"
        : p.method === "transfer"
          ? "Bank Transfer"
          : p.method === "pos_terminal"
            ? "POS Card"
            : "Credit (Owing)";
    doc.text(`• ${methodLabel}`, margin + 2, y);
    doc.text(formatCurrency(p.amount), pageWidth - margin, y, { align: "right" });
    y += 3.5;
  }

  // Footer Note
  y += 2;
  doc.line(margin, y, pageWidth - margin, y);
  y += 4;

  doc.setFontSize(7);
  doc.setFont("helvetica", "italic");
  const note = data.footerNote || "Thank you for your patronage!";
  const splitNote = doc.splitTextToSize(note, contentWidth);
  doc.text(splitNote, pageWidth / 2, y, { align: "center" });

  return doc;
}

/**
 * Generates and triggers browser download of the receipt PDF.
 */
export function downloadReceiptPdf(data: ReceiptPdfData): void {
  const doc = generateReceiptPdf(data);
  const cleanNum = data.receiptNumber.replace(/[^a-zA-Z0-9_-]/g, "");
  doc.save(`receipt-${cleanNum || "sale"}.pdf`);
}
