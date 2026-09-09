import Papa from "papaparse";
import { productFormSchema, type ProductFormValues } from "./product-schema";
import { generateUniqueFallbackSku } from "./generate-sku";
import { db } from "@/lib/db";
import { tenantArray } from "@/lib/local-tenant";

export interface ParsedImportRow {
  rowNum: number;
  data: ProductFormValues;
  hasInitialStock: boolean;
  initialStockQty: number;
}

export interface ImportResult {
  validRows: ParsedImportRow[];
  errors: { rowNum: number; field?: string; message: string }[];
}

export const IMPORT_HEADERS = [
  "name",
  "sku",
  "barcode",
  "costPrice",
  "sellPrice",
  "unitLabel",
  "lowStockThreshold",
  "expiryTracking",
  "initialStock",
] as const;

export type ImportHeader = (typeof IMPORT_HEADERS)[number];

/**
 * All-or-nothing recovery aid: a CSV the merchant can reopen, fix, and
 * re-upload after a blocked import. Columns deliberately avoid the product
 * template headers so the file never looks like a half-completed import.
 * Missing field errors carry `row` (spreadsheet line), not a product id.
 */
export function buildErrorReportCsv(errors: ImportResult["errors"]): string {
  return Papa.unparse([
    ["row", "field", "message"],
    ...errors.map((e) => [String(e.rowNum), e.field ?? "", e.message]),
  ]);
}

/**
 * Builds the .xlsx template merchants download, fill in, and upload. Same
 * headers as the parser expects; the header row is frozen and bold so it
 * survives scrolling. exceljs is resolved lazily so the ~950KB browser
 * bundle is only pulled in when someone actually downloads a template.
 */
export async function buildSampleExcel(): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default ?? (await import("exceljs")).Workbook;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Products");

  const headerRow = sheet.addRow([...IMPORT_HEADERS]);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0A6E4D" } };
  });

  sheet.addRow(["Tomato paste", "TOMATO-001", "6900001234567", "120", "180", "tin", "12", "off", "40"]);
  sheet.addRow(["5kg Rice", "RICE-5", "", "3800", "4500", "bag", "10", "off", "25"]);

  sheet.columns = [
    { width: 22 },
    { width: 14 },
    { width: 18 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 16 },
    { width: 14 },
    { width: 12 },
  ];
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Normalizes an exceljs cell value into the plain string the parser expects. */
function excelCellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "on" : "off";
  if (typeof value === "object" && "text" in (value as { text?: unknown }) && (value as { text: unknown }).text !== undefined) {
    return String((value as { text: unknown }).text);
  }
  return String(value);
}

async function parseExcelFile(file: File): Promise<ImportResult> {
  const ExcelJS = (await import("exceljs")).default ?? (await import("exceljs")).Workbook;
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { validRows: [], errors: [{ rowNum: 1, message: "The Excel file has no worksheet to read from." }] };
  }

  const headerColumns = new Map<ImportHeader, number>();
  const rawRows: Array<{ rowNum: number; cells: Record<string, string> }> = [];

  sheet.eachRow((row, rowNumber) => {
    const valueAt = (col: number): string => {
      const cell = row.getCell(col);
      return excelCellToString(cell.value);
    };

    if (rowNumber === 1) {
      for (const header of IMPORT_HEADERS) {
        const col = row.cellCount;
        for (let i = 1; i <= col; i++) {
          if (valueAt(i).trim().toLowerCase() === header.toLowerCase()) {
            headerColumns.set(header, i);
            break;
          }
        }
      }
      return;
    }

    const cells: Record<string, string> = {};
    for (const header of IMPORT_HEADERS) {
      const col = headerColumns.get(header);
      if (col !== undefined) cells[header] = valueAt(col);
    }

    const hasAnyValue = Object.keys(cells).some((key) => cells[key].trim() !== "");
    if (hasAnyValue) {
      rawRows.push({ rowNum: rowNumber, cells });
    }
  });

  return validateRawRows(rawRows);
}

/**
 * Parses any uploaded file into the all-or-nothing result. The engine
 * auto-detects the type: an .xlsx (by extension or by the ZIP magic bytes
 * every real xlsx starts with) goes to the Excel path, anything else is
 * read as plain text.
 */
export async function parseProductFile(file: File): Promise<ImportResult> {
  const looksLikeXlsx =
    file.name.toLowerCase().endsWith(".xlsx") ||
    (await isXlsxMagicBytes(file));
  if (looksLikeXlsx) return parseExcelFile(file);
  return parseTextFile(file);
}

async function isXlsxMagicBytes(file: File): Promise<boolean> {
  try {
    const head = await file.slice(0, 4).arrayBuffer();
    const bytes = new Uint8Array(head);
    // ZIP local file header: PK\x03\x04
    return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  } catch {
    return false;
  }
}

async function parseTextFile(file: File): Promise<ImportResult> {
  const text = await file.text();
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rawRows = results.data.map((row, i) => ({ rowNum: i + 2, cells: row }));
        resolve(validateRawRows(rawRows));
      },
      error: (err: Error) => reject(err),
    });
  });
}

function validateRawRows(
  rawRows: Array<{ rowNum: number; cells: Record<string, string> }>
): Promise<ImportResult> {
  return (async () => {
    const validRows: ParsedImportRow[] = [];
    const errors: ImportResult["errors"] = [];

    const existingProducts = await tenantArray(db.products);
    const existingSkus = new Set(existingProducts.map((p) => p.sku.toLowerCase()));
    const existingBarcodes = new Set(
      existingProducts.filter((p) => p.barcode).map((p) => p.barcode!.toLowerCase())
    );

    const seenSkus = new Set<string>();
    const seenBarcodes = new Set<string>();

    for (const { rowNum, cells } of rawRows) {
      const name = cells.name?.trim() ?? "";
      const costPriceRaw = (cells.costPrice ?? "").trim();
      const sellPriceRaw = (cells.sellPrice ?? "").trim();

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
        sku: cells.sku?.trim() || "",
        barcode: cells.barcode?.trim() || "",
        costPrice: costPriceRaw !== "" ? Number(costPriceRaw) : undefined,
        sellPrice: sellPriceRaw !== "" ? Number(sellPriceRaw) : undefined,
        unitLabel: cells.unitLabel?.trim() || "piece",
        lowStockThreshold: cells.lowStockThreshold ? Number(cells.lowStockThreshold) : undefined,
        expiryTracking: cells.expiryTracking?.trim() || "off",
        initialStock: cells.initialStock?.trim() || "0",
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

    return { validRows, errors };
  })();
}