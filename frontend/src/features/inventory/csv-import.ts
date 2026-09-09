import Papa from "papaparse";
import { productFormSchema, type ProductFormValues } from "./product-schema";
import { generateUniqueFallbackSku } from "./generate-sku";
import { db } from "@/lib/db";
import { tenantArray } from "@/lib/local-tenant";

export interface ParsedCsvRow {
  rowNum: number;
  data: ProductFormValues;
  hasInitialStock: boolean;
  initialStockQty: number;
}

export interface CsvImportResult {
  validRows: ParsedCsvRow[];
  errors: { rowNum: number; field?: string; message: string }[];
}

export const CSV_TEMPLATE_HEADERS = [
  "name",
  "sku",
  "barcode",
  "costPrice",
  "sellPrice",
  "unitLabel",
  "lowStockThreshold",
  "expiryTracking",
  "initialStock",
];

export function buildSampleCsv(): string {
  return Papa.unparse([
    CSV_TEMPLATE_HEADERS,
    ["Tomato paste", "TOMATO-001", "6900001234567", "120", "180", "tin", "12", "off", "40"],
    ["5kg Rice", "RICE-5", "", "3800", "4500", "bag", "10", "off", "25"],
  ]);
}

/**
 * All-or-nothing recovery aid: a CSV the merchant can reopen, fix, and
 * re-upload after a blocked import. Columns deliberately avoid the product
 * template headers so the file never looks like a half-completed import.
 * Missing field errors carry `row` (spreadsheet line), not a product id.
 */
export function buildErrorReportCsv(errors: CsvImportResult["errors"]): string {
  return Papa.unparse([
    ["row", "field", "message"],
    ...errors.map((e) => [String(e.rowNum), e.field ?? "", e.message]),
  ]);
}

export async function parseProductCsv(file: File): Promise<CsvImportResult> {
  const text = await file.text();
  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const validRows: ParsedCsvRow[] = [];
        const errors: CsvImportResult["errors"] = [];

        try {
          const existingProducts = await tenantArray(db.products);
          const existingSkus = new Set(existingProducts.map((p) => p.sku.toLowerCase()));
          const existingBarcodes = new Set(
            existingProducts.filter((p) => p.barcode).map((p) => p.barcode!.toLowerCase())
          );

          const seenSkus = new Set<string>();
          const seenBarcodes = new Set<string>();

          for (let i = 0; i < results.data.length; i++) {
            const row = results.data[i] as Record<string, string>;
            const rowNum = i + 2; // +1 for 0-index, +1 for header

            const name = row.name?.trim() ?? "";
            const costPriceRaw = (row.costPrice ?? "").trim();
            const sellPriceRaw = (row.sellPrice ?? "").trim();

            // Core cells are compulsory and all-or-nothing: a blank core
            // value in ANY row blocks the whole file (nothing is written).
            // A blank costPrice coerces to 0 in the schema, so it is checked
            // explicitly here before coercion.
            if (!name) {
              errors.push({ rowNum, field: "name", message: "Product name is required" });
            }
            if (costPriceRaw === "") {
              errors.push({ rowNum, field: "costPrice", message: "Cost price is required" });
            }
            if (sellPriceRaw === "") {
              errors.push({ rowNum, field: "sellPrice", message: "Selling price is required" });
            }
            if (!name || costPriceRaw === "" || sellPriceRaw === "") continue;

            const rawData = {
              name,
              sku: row.sku?.trim() || "",
              barcode: row.barcode?.trim() || "",
              costPrice: costPriceRaw !== "" ? Number(costPriceRaw) : undefined,
              sellPrice: sellPriceRaw !== "" ? Number(sellPriceRaw) : undefined,
              unitLabel: row.unitLabel?.trim() || "piece",
              lowStockThreshold: row.lowStockThreshold ? Number(row.lowStockThreshold) : undefined,
              expiryTracking: row.expiryTracking?.trim() || "off",
              initialStock: row.initialStock?.trim() || "0",
            };

            const parsed = productFormSchema.safeParse(rawData);
            if (!parsed.success) {
              for (const issue of parsed.error.issues) {
                errors.push({
                  rowNum,
                  field: issue.path[0]?.toString(),
                  message: issue.message,
                });
              }
              continue;
            }

            const data = parsed.data;

            // Blank SKU → auto-generate from the name, exactly like the
            // Add Product flow, and guaranteed unique against the DSB and
            // this file. Kept here (not in the schema) so a blank SKU
            // never silently imports as an empty code.
            const sku = data.sku.trim()
              ? data.sku.trim()
              : generateUniqueFallbackSku(data.name, new Set([...existingSkus, ...seenSkus]));
            if (existingSkus.has(sku.toLowerCase()) || seenSkus.has(sku.toLowerCase())) {
              errors.push({ rowNum, field: "sku", message: `SKU "${sku}" is already in use.` });
              continue;
            }
            seenSkus.add(sku.toLowerCase());

            if (data.barcode) {
              if (existingBarcodes.has(data.barcode.toLowerCase()) || seenBarcodes.has(data.barcode.toLowerCase())) {
                errors.push({ rowNum, field: "barcode", message: `Barcode "${data.barcode}" is already in use.` });
                continue;
              }
              seenBarcodes.add(data.barcode.toLowerCase());
            }

            const initialStockQty = Number(rawData.initialStock);
            const hasInitialStock = initialStockQty > 0;

            validRows.push({ rowNum, data: { ...data, sku }, hasInitialStock, initialStockQty });
          }

          resolve({ validRows, errors });
        } catch (err) {
          reject(err);
        }
      },
      error: (err: Error) => {
        reject(err);
      },
    });
  });
}
