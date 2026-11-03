import jsPDF from "jspdf";
import { getBrandingConfig } from "@/config/branding";
import { formatCurrency } from "@/lib/format";
import type { ReceiptViewModel } from "@/features/pos/receipt-view-model";

export function receiptExportFileName(extension: "pdf" | "jpg"): string {
  return `sales_receipt.${extension}`;
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function shareOrDownload(blob: Blob, name: string, title: string): Promise<"shared" | "downloaded"> {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title });
    return "shared";
  }
  download(blob, name);
  return "downloaded";
}

export async function shareReceiptPdf(receipt: ReceiptViewModel): Promise<"shared" | "downloaded"> {
  // A PDF is the same completed visual document as the image export. Keeping
  // one canvas source prevents the two formats from drifting over time.
  const canvas = renderReceiptCanvas(receipt);
  const document = new jsPDF({
    orientation: "portrait",
    unit: "px",
    format: [canvas.width, canvas.height],
    hotfixes: ["px_scaling"],
  });
  document.addImage(canvas, "JPEG", 0, 0, canvas.width, canvas.height, undefined, "FAST");
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
  const width = 1080;
  const padding = 72;
  const line = 44;
  const height = Math.max(1420, 790 + receipt.items.length * 82 + receipt.payments.length * 52 + (receipt.usesCurrentCatalogLabels ? 62 : 0));
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
  context.fillStyle = accent;
  roundedRect(context, 36, 36, width - 72, 224, 32);
  context.fillRect(36, 210, width - 72, 50);

  context.fillStyle = "#1b1b1f";
  context.textAlign = "center";
  context.font = "700 44px system-ui, sans-serif";
  context.fillStyle = "#ffffff";
  context.fillText(receipt.businessName, width / 2, 116);
  context.font = "400 28px system-ui, sans-serif";
  context.fillStyle = "rgba(255,255,255,0.82)";
  context.fillText(`Sales receipt #${receipt.receiptNumber}`, width / 2, 164);
  context.fillText(receipt.dateLabel, width / 2, 204);
  let y = 318;
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
    const clippedName = item.name.length > 34 ? `${item.name.slice(0, 33)}…` : item.name;
    context.fillText(clippedName, padding, y);
    context.textAlign = "right";
    context.fillText(formatCurrency(item.total), width - padding, y);
    context.textAlign = "left";
    context.fillStyle = "#5f5f66";
    context.font = "400 24px system-ui, sans-serif";
    context.fillText(`${item.quantity} ${item.unitLabel} × ${formatCurrency(item.unitPrice)}`, padding, y + 32);
    context.fillStyle = "#1b1b1f";
    context.font = "500 28px system-ui, sans-serif";
    y += 82;
  }
  y += 12;
  context.strokeStyle = "#d5d5dc";
  context.beginPath(); context.moveTo(padding, y); context.lineTo(width - padding, y); context.stroke();
  y += 48;
  const totalRows: Array<[string, number]> = [["Subtotal", receipt.subtotal]];
  if (receipt.discount > 0) totalRows.push(["Discount", -receipt.discount]);
  totalRows.push(["Total", receipt.total]);
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
    context.textAlign = "left"; y += 36;
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
