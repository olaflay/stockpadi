import jsPDF from "jspdf";
import { getBrandingConfig } from "@/config/branding";
import { formatCurrency } from "@/lib/format";
import type { ReceiptViewModel } from "@/features/pos/receipt-view-model";
import { documentMotifOpacity, documentMotifTiles } from "@/components/illustrations/document-motif";

export function receiptExportFileName(extension: "pdf" | "jpg"): string {
  return `sales_receipt.${extension}`;
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

async function shareOrDownload(blob: Blob, name: string, title: string): Promise<"shared" | "downloaded"> {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return "shared";
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "NotAllowedError")) throw error;
    }
  }
  download(blob, name);
  return "downloaded";
}

export async function shareReceiptPdf(receipt: ReceiptViewModel): Promise<"shared" | "downloaded"> {
  const canvas = renderReceiptCanvas(receipt);
  const width = 80;
  const height = width * canvas.height / canvas.width;
  const document = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [width, height],
  });
  document.addImage(canvas, "JPEG", 0, 0, width, height, undefined, "FAST");
  document.setProperties({ title: `Sales receipt ${receipt.receiptNumber}`, subject: "Sales receipt" });
  return shareOrDownload(document.output("blob"), receiptExportFileName("pdf"), "Sales receipt");
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not create receipt image")), "image/jpeg", 0.94);
  });
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
}

/**
 * Shared visual receipt renderer. It deliberately uses no DOM screenshot
 * library or remote asset, keeping exports deterministic on low-end devices.
 */
export function renderReceiptCanvas(receipt: ReceiptViewModel): HTMLCanvasElement {
  const width = 760;
  const padding = 64;
  const line = 44;
  const headerBottom = receipt.voidedAt ? 272 : 232;
  const itemHeight = 82;
  const paymentHeight = 36;
  const totalRows: Array<[string, number]> = [["Subtotal", receipt.subtotal]];
  if (receipt.discount > 0) totalRows.push(["Discount", -receipt.discount]);
  totalRows.push(["Total", receipt.total]);
  const totalsHeight = (totalRows.length - 1) * line + 56;
  // Account for the section labels and dividers as well as the variable rows.
  const height = Math.max(840, headerBottom + 182 + receipt.items.length * itemHeight
    + totalsHeight + receipt.payments.length * paymentHeight
    + (receipt.usesCurrentCatalogLabels ? 24 : 0) + padding);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare receipt image");
  const accent = getBrandingConfig().accentColor;
  context.fillStyle = "#f4f5f2";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#ffffff";
  roundedRect(context, 36, 36, width - 72, height - 72, 32);
  const tileSize = 18;
  const tileStep = 23;
  const motifWidth = (documentMotifTiles[0].length - 1) * tileStep + tileSize;
  const motifX = width - padding - motifWidth;
  context.save();
  context.fillStyle = accent;
  documentMotifTiles.forEach((row, rowIndex) => {
    row.forEach((tile, columnIndex) => {
      if (!tile) return;
      context.globalAlpha = documentMotifOpacity[tile];
      context.fillRect(motifX + columnIndex * tileStep, 80 + rowIndex * tileStep, tileSize, tileSize);
    });
  });
  context.restore();

  context.textAlign = "left";
  context.font = "700 44px system-ui, sans-serif";
  context.fillStyle = "#1b1b1f";
  context.fillText(receipt.businessName, padding, 116, motifX - padding * 1.5);
  context.font = "400 28px system-ui, sans-serif";
  context.fillStyle = "#5f5f66";
  context.fillText(`Sales receipt #${receipt.receiptNumber}`, padding, 161);
  context.fillText(receipt.dateLabel, padding, 201);
  if (receipt.voidedAt) {
    context.font = "700 26px system-ui, sans-serif";
    context.fillStyle = "#8a2428";
    context.fillText("Cancelled", padding, 241);
  }
  let y = headerBottom;
  context.strokeStyle = "#d5d5dc";
  context.lineWidth = 2;
  context.beginPath(); context.moveTo(padding, y); context.lineTo(width - padding, y); context.stroke();
  y += 52;
  context.textAlign = "left";
  context.fillStyle = "#1b1b1f";
  context.font = "700 26px system-ui, sans-serif";
  context.fillText("ITEMS", padding, y);
  y += 36;
  context.font = "400 28px system-ui, sans-serif";
  for (const item of receipt.items) {
    const amount = formatCurrency(item.total);
    const amountWidth = Math.min(context.measureText(amount).width, 240);
    context.fillText(item.name, padding, y, width - padding * 2 - amountWidth - 24);
    context.textAlign = "right";
    context.fillText(amount, width - padding, y, amountWidth);
    context.textAlign = "left";
    context.fillStyle = "#5f5f66";
    context.font = "400 24px system-ui, sans-serif";
    context.fillText(`${item.quantity} ${item.unitLabel} × ${formatCurrency(item.unitPrice)}`, padding, y + 32, width - padding * 2);
    context.fillStyle = "#1b1b1f";
    context.font = "500 28px system-ui, sans-serif";
    y += itemHeight;
  }
  y += 12;
  context.strokeStyle = "#d5d5dc";
  context.beginPath(); context.moveTo(padding, y); context.lineTo(width - padding, y); context.stroke();
  y += 48;
  for (const [label, amount] of totalRows) {
    const isTotal = label === "Total";
    context.font = `${isTotal ? "700 34" : "400 28"}px system-ui, sans-serif`;
    context.textAlign = "left"; context.fillText(label, padding, y);
    context.textAlign = "right"; context.fillText(formatCurrency(amount), width - padding, y);
    y += isTotal ? 56 : line;
  }
  context.textAlign = "left";
  context.font = "600 24px system-ui, sans-serif";
  context.fillStyle = "#5f5f66";
  context.fillText("Payment", padding, y);
  y += 34;
  for (const payment of receipt.payments) {
    context.fillText(payment.method.replace("_", " "), padding, y);
    context.textAlign = "right"; context.fillText(formatCurrency(payment.amount), width - padding, y);
    context.textAlign = "left"; y += paymentHeight;
  }
  if (receipt.usesCurrentCatalogLabels) {
    context.font = "400 20px system-ui, sans-serif";
    context.fillStyle = "#5f5f66";
    context.fillText("Some legacy item names use today's catalogue labels.", padding, y + 18);
  }
  return canvas;
}

export async function shareReceiptImage(receipt: ReceiptViewModel): Promise<"shared" | "downloaded"> {
  const blob = await canvasBlob(renderReceiptCanvas(receipt));
  return shareOrDownload(blob, receiptExportFileName("jpg"), "Sales receipt");
}
