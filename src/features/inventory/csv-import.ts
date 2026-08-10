import Papa from "papaparse";
import { productFormSchema, type ProductFormValues } from "./product-schema";
import { db } from "@/lib/db";

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
    ["Sample Product", "SMP-001", "123456789", "100", "150", "piece", "5", "off", "10"],
  ]);
}

export async function parseProductCsv(file: File): Promise<CsvImportResult> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const validRows: ParsedCsvRow[] = [];
        const errors: CsvImportResult["errors"] = [];

        try {
          const existingProducts = await db.products.toArray();
          const existingSkus = new Set(existingProducts.map((p) => p.sku.toLowerCase()));
          const existingBarcodes = new Set(
            existingProducts.filter((p) => p.barcode).map((p) => p.barcode!.toLowerCase())
          );

          const seenSkus = new Set<string>();
          const seenBarcodes = new Set<string>();

          for (let i = 0; i < results.data.length; i++) {
            const row = results.data[i] as Record<string, string>;
            const rowNum = i + 2; // +1 for 0-index, +1 for header

            const rawData = {
              name: row.name?.trim() || "",
              sku: row.sku?.trim() || "",
              barcode: row.barcode?.trim() || "",
              costPrice: row.costPrice !== undefined ? Number(row.costPrice) : undefined,
              sellPrice: row.sellPrice !== undefined ? Number(row.sellPrice) : undefined,
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

            if (existingSkus.has(data.sku.toLowerCase()) || seenSkus.has(data.sku.toLowerCase())) {
              errors.push({ rowNum, field: "sku", message: `SKU "${data.sku}" is already in use.` });
              continue;
            }
            seenSkus.add(data.sku.toLowerCase());

            if (data.barcode) {
              if (existingBarcodes.has(data.barcode.toLowerCase()) || seenBarcodes.has(data.barcode.toLowerCase())) {
                errors.push({ rowNum, field: "barcode", message: `Barcode "${data.barcode}" is already in use.` });
                continue;
              }
              seenBarcodes.add(data.barcode.toLowerCase());
            }

            const initialStockQty = Number(rawData.initialStock);
            const hasInitialStock = initialStockQty > 0;

            validRows.push({ rowNum, data, hasInitialStock, initialStockQty });
          }

          resolve({ validRows, errors });
        } catch (err) {
          reject(err);
        }
      },
      error: (err) => {
        reject(err);
      },
    });
  });
}
