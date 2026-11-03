import jsPDF from "jspdf";
import { formatCurrency } from "@/lib/format";
import type { CustomerCreditMovement } from "@/lib/db";

export interface CreditStatement {
  businessName: string;
  customerName: string;
  customerPhone?: string | null;
  balance: number;
  generatedAt: Date;
  movements: CustomerCreditMovement[];
}

export function creditStatementFileName(extension: "pdf" | "jpg"): string {
  return `debt_statement.${extension}`;
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function shareOrDownload(blob: Blob, name: string): Promise<"shared" | "downloaded"> {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: "Debt statement" });
    return "shared";
  }
  download(blob, name);
  return "downloaded";
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
}

export function renderCreditStatementCanvas(statement: CreditStatement): HTMLCanvasElement {
  const width = 1080;
  const padding = 72;
  const height = Math.max(1420, 760 + statement.movements.length * 74);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare debt statement image");

  const debtPurple = "#6d28d9";
  context.fillStyle = "#f6f3fb";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#ffffff";
  roundedRect(context, 36, 36, width - 72, height - 72, 32);
  context.fillStyle = debtPurple;
  roundedRect(context, 36, 36, width - 72, 238, 32);
  context.fillRect(36, 220, width - 72, 54);

  context.textAlign = "center";
  context.fillStyle = "#ffffff";
  context.font = "700 42px system-ui, sans-serif";
  context.fillText(statement.businessName, width / 2, 108);
  context.font = "500 28px system-ui, sans-serif";
  context.fillText("Debt statement", width / 2, 154);
  context.font = "400 24px system-ui, sans-serif";
  context.fillText(statement.generatedAt.toLocaleString(), width / 2, 198);

  let y = 338;
  context.textAlign = "left";
  context.fillStyle = "#222027";
  context.font = "700 34px system-ui, sans-serif";
  context.fillText(statement.customerName, padding, y);
  if (statement.customerPhone) {
    context.font = "400 24px system-ui, sans-serif";
    context.fillStyle = "#68636f";
    context.fillText(statement.customerPhone, padding, y + 36);
  }

  y += 112;
  context.fillStyle = "#ede9fe";
  roundedRect(context, padding, y, width - padding * 2, 142, 24);
  context.fillStyle = "#4c1d95";
  context.font = "600 24px system-ui, sans-serif";
  context.fillText("TOTAL OUTSTANDING", padding + 28, y + 42);
  context.font = "800 48px system-ui, sans-serif";
  context.fillText(formatCurrency(Math.max(statement.balance, 0)), padding + 28, y + 104);

  y += 210;
  context.fillStyle = "#222027";
  context.font = "700 25px system-ui, sans-serif";
  context.fillText("ACTIVITY", padding, y);
  y += 44;

  const ordered = [...statement.movements].sort((a, b) => a.createdAtLocal.localeCompare(b.createdAtLocal));
  for (const movement of ordered) {
    const isDebt = movement.amountDelta > 0;
    context.font = "500 27px system-ui, sans-serif";
    context.fillStyle = "#222027";
    context.textAlign = "left";
    context.fillText(isDebt ? "Credit sale" : "Payment received", padding, y);
    context.font = "400 21px system-ui, sans-serif";
    context.fillStyle = "#68636f";
    context.fillText(new Date(movement.createdAtLocal).toLocaleString(), padding, y + 29);
    context.textAlign = "right";
    context.font = "700 27px system-ui, sans-serif";
    context.fillStyle = isDebt ? debtPurple : "#15803d";
    context.fillText(formatCurrency(movement.amountDelta), width - padding, y + 8);
    y += 74;
  }

  return canvas;
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not create debt statement image")), "image/jpeg", 0.94);
  });
}

export async function shareCreditStatementImage(statement: CreditStatement): Promise<"shared" | "downloaded"> {
  return shareOrDownload(await canvasBlob(renderCreditStatementCanvas(statement)), creditStatementFileName("jpg"));
}

export async function shareCreditStatementPdf(statement: CreditStatement): Promise<"shared" | "downloaded"> {
  const canvas = renderCreditStatementCanvas(statement);
  const document = new jsPDF({ orientation: "portrait", unit: "px", format: [canvas.width, canvas.height], hotfixes: ["px_scaling"] });
  document.addImage(canvas, "JPEG", 0, 0, canvas.width, canvas.height, undefined, "FAST");
  document.setProperties({ title: `Debt statement for ${statement.customerName}`, subject: "Debt statement" });
  return shareOrDownload(document.output("blob"), creditStatementFileName("pdf"));
}
