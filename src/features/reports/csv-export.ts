import type { Product } from "@/types/product";
import type { Sale } from "@/types/sale";

export function escapeCsvField(field: string | number | null | undefined): string {
  if (field === null || field === undefined) return "";
  const str = String(field);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildProductsCsv(products: Product[]): string {
  const headers = [
    "ID",
    "Name",
    "SKU",
    "Barcode",
    "Cost Price",
    "Sell Price",
    "Unit",
    "Category ID",
    "Expiry Tracking",
    "Low Stock Threshold",
  ];
  const rows = products.map((p) => [
    p.id,
    p.name,
    p.sku,
    p.barcode,
    p.costPrice,
    p.sellPrice,
    p.unitLabel,
    p.categoryId,
    p.expiryTracking,
    p.lowStockThreshold,
  ]);

  return [
    headers.map(escapeCsvField).join(","),
    ...rows.map((row) => row.map(escapeCsvField).join(",")),
  ].join("\n");
}

export function buildSalesCsv(sales: Sale[], products: Product[]): string {
  const headers = [
    "Sale ID",
    "Date",
    "Branch ID",
    "Customer ID",
    "Payment Methods",
    "Product Name",
    "SKU",
    "Quantity",
    "Unit Price",
    "Discount",
    "Total",
  ];

  const productMap = new Map(products.map((p) => [p.id, p]));
  const rows: (string | number | null | undefined)[][] = [];

  for (const sale of sales) {
    if (sale.voidedAt) continue;

    const date = sale.createdAtLocal;
    const paymentMethods = sale.payments?.map((p) => p.method).join("; ") || "unknown";

    for (const item of sale.items) {
      const product = productMap.get(item.productId);
      rows.push([
        sale.id,
        date,
        sale.branchId,
        sale.customerId,
        paymentMethods,
        product?.name || "Unknown Product",
        product?.sku || "",
        item.quantity,
        item.unitPrice,
        item.discount,
        (item.unitPrice - item.discount) * item.quantity,
      ]);
    }
  }

  return [
    headers.map(escapeCsvField).join(","),
    ...rows.map((row) => row.map(escapeCsvField).join(",")),
  ].join("\n");
}
