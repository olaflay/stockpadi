import type { Product } from "@/types/product";
import type { Sale } from "@/types/sale";
import type { Column, Workbook as ExcelWorkbook } from "exceljs";
import { fromKobo, toKobo } from "@/lib/kobo";

export type AccountingExport =
  | { dataset: "products"; products: Product[] }
  | { dataset: "sales"; sales: Sale[]; products: Product[] };

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const money = '#,##0.00;[Red](#,##0.00)';

function sheet(workbook: ExcelWorkbook, name: string, columns: Array<Partial<Column>>) {
  const worksheet = workbook.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  worksheet.columns = columns;
  worksheet.getRow(1).font = { bold: true };
  return worksheet;
}

export async function buildAccountingWorkbook(input: AccountingExport): Promise<Blob> {
  const imported = await import("exceljs");
  const { Workbook } = imported.default ?? imported;
  const workbook = new Workbook();

  if (input.dataset === "products") {
    const products = sheet(workbook, "Products", [
      { header: "Product ID", width: 38 }, { header: "Name", width: 32 },
      { header: "SKU", width: 20 }, { header: "Barcode", width: 24 },
      { header: "Cost price", width: 15, style: { numFmt: money } },
      { header: "Sell price", width: 15, style: { numFmt: money } },
      { header: "Unit", width: 16 }, { header: "Category ID", width: 38 },
      { header: "Expiry tracking", width: 18 }, { header: "Expiry date", width: 16 },
      { header: "Low stock threshold", width: 22 }, { header: "Archived", width: 12 },
    ]);
    for (const product of input.products) {
      products.addRow([
        product.id, product.name, product.sku, product.barcode, product.costPrice, product.sellPrice,
        product.unitLabel, product.categoryId, product.expiryTracking, product.expiryDate,
        product.lowStockThreshold, product.archived ?? false,
      ]);
    }
    products.autoFilter = `A1:L${products.rowCount}`;
  } else {
    const sales = sheet(workbook, "Sales", [
      { header: "Sale ID", width: 38 },
      { header: "Date (UTC)", width: 22, style: { numFmt: "yyyy-mm-dd hh:mm:ss" } },
      { header: "Branch ID", width: 38 }, { header: "Customer ID", width: 38 },
      { header: "Subtotal", width: 15, style: { numFmt: money } },
      { header: "Discount", width: 15, style: { numFmt: money } },
      { header: "Sale total", width: 15, style: { numFmt: money } },
      { header: "Cash", width: 15, style: { numFmt: money } },
      { header: "Transfer", width: 15, style: { numFmt: money } },
      { header: "POS", width: 15, style: { numFmt: money } },
      { header: "Credit", width: 15, style: { numFmt: money } },
    ]);
    const items = sheet(workbook, "Sale items", [
      { header: "Sale ID", width: 38 }, { header: "Product ID", width: 38 },
      { header: "Product name", width: 34 }, { header: "Name source", width: 20 },
      { header: "Current SKU", width: 20 }, { header: "Quantity", width: 14 },
      { header: "Unit", width: 16 }, { header: "Unit price", width: 15, style: { numFmt: money } },
      { header: "Line discount", width: 15, style: { numFmt: money } },
      { header: "Line total", width: 15, style: { numFmt: money } },
    ]);
    const catalog = new Map(input.products.map((product) => [product.id, product]));
    for (const sale of input.sales) {
      if (sale.voidedAt) continue;
      const amounts = { cash: 0, transfer: 0, pos_terminal: 0, credit: 0 };
      for (const payment of sale.payments ?? []) amounts[payment.method] += toKobo(payment.amount);
      const date = new Date(sale.createdAtLocal);
      sales.addRow([
        sale.id, Number.isNaN(date.valueOf()) ? sale.createdAtLocal : date, sale.branchId, sale.customerId,
        sale.subtotal, sale.discount, sale.total, ...Object.values(amounts).map(fromKobo),
      ]);
      for (const item of sale.items) {
        const product = catalog.get(item.productId);
        items.addRow([
          sale.id, item.productId, item.productNameSnapshot ?? product?.name ?? null,
          item.productNameSnapshot ? "At sale" : product ? "Current catalog" : "Unavailable",
          product?.sku ?? null, item.quantity, item.unitLabel, item.unitPrice, item.discount,
          fromKobo(Math.round(toKobo(item.unitPrice) * item.quantity) - toKobo(item.discount)),
        ]);
      }
    }
    sales.autoFilter = `A1:K${sales.rowCount}`;
    items.autoFilter = `A1:J${items.rowCount}`;
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: XLSX_MIME });
}
