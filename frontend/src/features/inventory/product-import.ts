import Papa from "papaparse";
import { productFormSchema, type ProductFormValues } from "./product-schema";
import { generateUniqueFallbackSku } from "./generate-sku";
import { db } from "@/lib/db";
import { tenantArray } from "@/lib/local-tenant";
import {
  PRODUCT_IMPORT_MAX_FILE_BYTES,
  PRODUCT_IMPORT_MAX_ROWS,
  PRODUCT_IMPORT_MAX_COLUMNS,
  PRODUCT_IMPORT_MAX_WORKSHEETS,
} from "@/config/limits";

export interface ParsedImportRow {
  rowNum: number;
  data: ProductFormValues;
  hasInitialStock: boolean;
  initialStockQty: number;
}

export interface ImportError {
  rowNum: number;
  field?: string;
  message: string;
}

export interface ImportResult {
  totalRows: number;
  validRows: ParsedImportRow[];
  errors: ImportError[];
  duplicateWarnings: ImportError[];
  totalOpeningStockUnits: number;
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
  "expiryDate",
  "initialStock",
] as const;

export type ImportHeader = (typeof IMPORT_HEADERS)[number];

const TEMPLATE_START_ROW = 2;
const TEMPLATE_END_ROW = PRODUCT_IMPORT_MAX_ROWS + 1;
const TEMPLATE_STARTER_ROWS = 12;
const TEMPLATE_HEADERS = [
  "Product name",
  "SKU",
  "Barcode",
  "Cost price",
  "Sell price",
  "Unit",
  "Low-stock alert",
  "Expiry tracking",
  "Expiry date",
  "Opening stock",
] as const;

const REQUIRED_IMPORT_HEADERS: readonly ImportHeader[] = ["name", "costPrice", "sellPrice"];

/** Conservative aliases preserve common older templates without accepting typos. */
const HEADER_ALIASES: Record<ImportHeader, readonly string[]> = {
  name: ["name", "productName", "product_name", "product name"],
  sku: ["sku", "productSku", "product_sku", "product code", "item code"],
  barcode: ["barcode", "bar_code", "bar code"],
  costPrice: ["costPrice", "cost_price", "cost price"],
  sellPrice: ["sellPrice", "sell_price", "sell price"],
  unitLabel: ["unitLabel", "unit_label", "unit"],
  lowStockThreshold: ["lowStockThreshold", "low_stock_threshold", "low stock threshold", "low stock alert", "low-stock alert"],
  expiryTracking: ["expiryTracking", "expiry_tracking", "expiry tracking"],
  expiryDate: ["expiryDate", "expiry_date", "expiry date"],
  initialStock: ["initialStock", "initial_stock", "initial stock", "starting stock", "opening stock", "opening quantity"],
};

type RawCell = unknown;
type RawRow = { rowNum: number; cells: Record<ImportHeader, RawCell | undefined> };

function emptyResult(errors: ImportError[], totalRows = 0): ImportResult {
  return {
    totalRows,
    validRows: [],
    errors,
    duplicateWarnings: errors.filter((error) => error.field === "sku" || error.field === "barcode"),
    totalOpeningStockUnits: 0,
  };
}

function resultFromRows(totalRows: number, validRows: ParsedImportRow[], errors: ImportError[]): ImportResult {
  return {
    totalRows,
    validRows,
    errors,
    duplicateWarnings: errors.filter((error) => error.field === "sku" || error.field === "barcode"),
    totalOpeningStockUnits: validRows.reduce((sum, row) => sum + row.initialStockQty, 0),
  };
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

const NORMALIZED_HEADER_ALIASES = new Map<string, ImportHeader>(
  IMPORT_HEADERS.flatMap((header) => HEADER_ALIASES[header].map((alias) => [normalizeHeader(alias), header] as const))
);

function levenshteinDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const above = previous[column];
      previous[column] = left[row - 1] === right[column - 1]
        ? diagonal
        : Math.min(diagonal + 1, previous[column] + 1, previous[column - 1] + 1);
      diagonal = above;
    }
  }
  return previous[right.length];
}

function headerSuggestion(header: string): ImportHeader | undefined {
  const normalized = normalizeHeader(header);
  let best: ImportHeader | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of IMPORT_HEADERS) {
    const distance = levenshteinDistance(normalized, normalizeHeader(candidate));
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return bestDistance <= Math.max(2, Math.floor(normalized.length / 3)) ? best : undefined;
}

function validateHeaders(headers: string[]): { columns: Map<ImportHeader, number>; errors: ImportError[] } {
  const columns = new Map<ImportHeader, number>();
  const errors: ImportError[] = [];
  const seenSourceHeaders = new Set<string>();

  headers.forEach((rawHeader, index) => {
    const header = rawHeader.trim();
    if (!header) return;
    const normalized = normalizeHeader(header);
    if (seenSourceHeaders.has(normalized)) {
      errors.push({ rowNum: 1, field: header, message: `Duplicate column '${header}'. Keep only one copy.` });
      return;
    }
    seenSourceHeaders.add(normalized);

    const canonical = NORMALIZED_HEADER_ALIASES.get(normalized);
    if (!canonical) {
      const suggestion = headerSuggestion(header);
      errors.push({
        rowNum: 1,
        field: header,
        message: suggestion
          ? `Unknown column '${header}'. Did you mean '${suggestion}'?`
          : `Unknown column '${header}'. Remove it or use one of the supported template columns.`,
      });
      return;
    }
    if (columns.has(canonical)) {
      errors.push({ rowNum: 1, field: header, message: `Column '${canonical}' was provided more than once.` });
      return;
    }
    columns.set(canonical, index);
  });

  for (const required of REQUIRED_IMPORT_HEADERS) {
    if (!columns.has(required)) errors.push({ rowNum: 1, field: required, message: `Required column '${required}' is missing.` });
  }
  if (columns.size === 0) errors.push({ rowNum: 1, message: "No recognized product columns were found. Use the downloaded template headers." });
  return { columns, errors };
}

function rowFromValues(values: RawCell[], rowNum: number, columns: Map<ImportHeader, number>): RawRow {
  const cells = {} as Record<ImportHeader, RawCell | undefined>;
  for (const header of IMPORT_HEADERS) cells[header] = columns.has(header) ? values[columns.get(header)!] : undefined;
  return { rowNum, cells };
}

function cellToString(value: RawCell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "string") return String(value);
  if (typeof value === "boolean") return value ? "on" : "off";
  if (typeof value === "object") {
    const objectValue = value as { text?: unknown; result?: unknown; richText?: Array<{ text?: unknown }> };
    if (objectValue.result !== undefined) return cellToString(objectValue.result);
    if (objectValue.text !== undefined) return String(objectValue.text);
    if (objectValue.richText) return objectValue.richText.map((part) => String(part.text ?? "")).join("");
  }
  return String(value);
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function formatIsoDate(date: Date): string {
  return `${date.getUTCFullYear().toString().padStart(4, "0")}-${(date.getUTCMonth() + 1).toString().padStart(2, "0")}-${date.getUTCDate().toString().padStart(2, "0")}`;
}

function excelDateToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return null;
  const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000);
  return isValidDateParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()) ? formatIsoDate(date) : null;
}

function parseExpiryDate(value: RawCell): { value: string | null; invalid: boolean } {
  if (value === null || value === undefined || cellToString(value).trim() === "") return { value: null, invalid: false };
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? { value: null, invalid: true } : { value: formatIsoDate(value), invalid: false };
  if (typeof value === "number") {
    const iso = excelDateToIso(value);
    return { value: iso, invalid: iso === null };
  }
  if (typeof value === "object" && value !== null && (value as { result?: unknown }).result !== undefined) {
    return parseExpiryDate((value as { result: unknown }).result);
  }
  const text = cellToString(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match || !isValidDateParts(Number(match[1]), Number(match[2]), Number(match[3]))) return { value: null, invalid: true };
  return { value: text, invalid: false };
}

function parseFiniteNumber(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const number = Number(value.trim());
  return Number.isFinite(number) ? number : undefined;
}

function validateRawRows(rawRows: RawRow[], headerErrors: ImportError[] = []): Promise<ImportResult> {
  return (async () => {
    const errors: ImportError[] = [...headerErrors];
    const validRows: ParsedImportRow[] = [];
    const existingProducts = await tenantArray(db.products);
    const existingSkus = new Set(existingProducts.map((product) => product.sku.trim().toLowerCase()));
    const existingBarcodes = new Set(existingProducts.filter((product) => product.barcode).map((product) => product.barcode!.trim().toLowerCase()));
    const seenSkus = new Map<string, number>();
    const seenBarcodes = new Map<string, number>();

    for (const { rowNum, cells } of rawRows) {
      const name = cellToString(cells.name).trim();
      const costPriceRaw = cellToString(cells.costPrice).trim();
      const sellPriceRaw = cellToString(cells.sellPrice).trim();
      const rowErrors: ImportError[] = [];
      if (!name) rowErrors.push({ rowNum, field: "name", message: "Product name is required" });
      if (!costPriceRaw) rowErrors.push({ rowNum, field: "costPrice", message: "Cost price is required" });
      if (!sellPriceRaw) rowErrors.push({ rowNum, field: "sellPrice", message: "Selling price is required" });
      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
        continue;
      }

      const initialStockRaw = cellToString(cells.initialStock).trim();
      const initialStockQty = initialStockRaw === "" ? 0 : parseFiniteNumber(initialStockRaw);
      if (initialStockQty === undefined || initialStockQty < 0 || !Number.isInteger(initialStockQty)) {
        errors.push({ rowNum, field: "initialStock", message: "Quantity in stock must be a non-negative whole number." });
        continue;
      }

      const expiry = parseExpiryDate(cells.expiryDate);
      const expiryTracking = cellToString(cells.expiryTracking).trim().toLowerCase() || "off";
      if (expiry.invalid) {
        errors.push({ rowNum, field: "expiryDate", message: "Expiry date must be a valid ISO date (YYYY-MM-DD) or Excel date." });
        continue;
      }
      if (expiryTracking === "mandatory" && !expiry.value) {
        errors.push({ rowNum, field: "expiryDate", message: "Expiry date is required when expiry tracking is mandatory." });
        continue;
      }
      if (expiryTracking === "off" && expiry.value) {
        errors.push({ rowNum, field: "expiryDate", message: "Leave expiryDate blank when expiryTracking is off." });
        continue;
      }

      const rawData = {
        name,
        sku: cellToString(cells.sku).trim(),
        barcode: cellToString(cells.barcode).trim(),
        costPrice: parseFiniteNumber(costPriceRaw),
        sellPrice: parseFiniteNumber(sellPriceRaw),
        unitLabel: cellToString(cells.unitLabel).trim() || "piece",
        lowStockThreshold: parseFiniteNumber(cellToString(cells.lowStockThreshold).trim()),
        expiryTracking,
        expiryDate: expiry.value ?? "",
      };
      const parsed = productFormSchema.safeParse(rawData);
      if (!parsed.success) {
        errors.push(...parsed.error.issues.map((issue) => ({ rowNum, field: issue.path[0]?.toString(), message: issue.message })));
        continue;
      }

      const data = parsed.data;
      const sku = data.sku.trim() ? data.sku.trim() : generateUniqueFallbackSku(data.name, new Set([...existingSkus, ...seenSkus.keys()]));
      const normalizedSku = sku.toLowerCase();
      const previousSkuRow = seenSkus.get(normalizedSku);
      if (existingSkus.has(normalizedSku)) {
        errors.push({ rowNum, field: "sku", message: `SKU "${sku}" is already in use.` });
      } else if (previousSkuRow !== undefined) {
        errors.push({ rowNum, field: "sku", message: `SKU "${sku}" is duplicated in the file (first used on row ${previousSkuRow}).` });
      } else {
        seenSkus.set(normalizedSku, rowNum);
      }

      const barcode = data.barcode?.trim() ?? "";
      const normalizedBarcode = barcode.toLowerCase();
      const previousBarcodeRow = normalizedBarcode ? seenBarcodes.get(normalizedBarcode) : undefined;
      if (normalizedBarcode && existingBarcodes.has(normalizedBarcode)) {
        errors.push({ rowNum, field: "barcode", message: `Barcode "${barcode}" is already in use.` });
      } else if (normalizedBarcode && previousBarcodeRow !== undefined) {
        errors.push({ rowNum, field: "barcode", message: `Barcode "${barcode}" is duplicated in the file (first used on row ${previousBarcodeRow}).` });
      } else if (normalizedBarcode) {
        seenBarcodes.set(normalizedBarcode, rowNum);
      }
      if (errors.some((error) => error.rowNum === rowNum)) continue;
      validRows.push({ rowNum, data: { ...data, sku }, hasInitialStock: initialStockQty > 0, initialStockQty });
    }
    return resultFromRows(rawRows.length, validRows, errors);
  })();
}

function valuesAreEmpty(values: RawCell[]): boolean {
  return values.every((value) => cellToString(value).trim() === "");
}

function tooManyRowsResult(): ImportResult {
  return emptyResult([{ rowNum: PRODUCT_IMPORT_MAX_ROWS + 2, message: `This file has more than ${PRODUCT_IMPORT_MAX_ROWS} product rows. Split it into smaller files.` }]);
}

async function parseExcelFile(file: File): Promise<ImportResult> {
  const excelModule = await import("exceljs");
  const ExcelJS = (excelModule.default && typeof excelModule.default === "object" ? excelModule.default : excelModule) as typeof excelModule;
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  if (workbook.worksheets.length > PRODUCT_IMPORT_MAX_WORKSHEETS) return emptyResult([{ rowNum: 1, message: `This workbook has ${workbook.worksheets.length} worksheets. Use at most ${PRODUCT_IMPORT_MAX_WORKSHEETS}.` }]);
  const sheet = workbook.worksheets[0];
  if (!sheet) return emptyResult([{ rowNum: 1, message: "The Excel file has no worksheet to read from." }]);
  if (sheet.columnCount > PRODUCT_IMPORT_MAX_COLUMNS) return emptyResult([{ rowNum: 1, message: `This worksheet has too many columns. Use at most ${PRODUCT_IMPORT_MAX_COLUMNS}.` }]);
  if (sheet.rowCount > PRODUCT_IMPORT_MAX_ROWS + 1) return tooManyRowsResult();

  const firstRow = sheet.getRow(1);
  const headerValues: RawCell[] = [];
  for (let column = 1; column <= Math.max(firstRow.cellCount, 1); column += 1) headerValues.push(firstRow.getCell(column).value);
  const { columns, errors: headerErrors } = validateHeaders(headerValues.map(cellToString));
  if (headerErrors.length > 0 && columns.size < REQUIRED_IMPORT_HEADERS.length) return emptyResult(headerErrors, Math.max(sheet.rowCount - 1, 0));

  const rawRows: RawRow[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const values: RawCell[] = [];
    for (let column = 1; column <= Math.max(row.cellCount, sheet.columnCount); column += 1) values.push(row.getCell(column).value);
    if (!valuesAreEmpty(values)) rawRows.push(rowFromValues(values, rowNumber, columns));
  }
  return validateRawRows(rawRows, headerErrors);
}

async function parseTextFile(file: File): Promise<ImportResult> {
  const text = await file.text();
  return new Promise((resolve, reject) => {
    const rows: RawCell[][] = [];
    let rowNumber = 0;
    let exceeded = false;
    Papa.parse<RawCell[]>(text, {
      header: false,
      skipEmptyLines: "greedy",
      step: (parsed, parser) => {
        rowNumber += 1;
        if (rowNumber > PRODUCT_IMPORT_MAX_ROWS + 1) {
          exceeded = true;
          parser.abort();
          return;
        }
        rows.push(parsed.data);
      },
      complete: () => {
        if (exceeded) {
          resolve(tooManyRowsResult());
          return;
        }
        const headers = (rows.shift() ?? []).map(cellToString);
        const { columns, errors: headerErrors } = validateHeaders(headers);
        if (headerErrors.length > 0 && columns.size < REQUIRED_IMPORT_HEADERS.length) {
          resolve(emptyResult(headerErrors, Math.max(rows.length - 1, 0)));
          return;
        }
        const rawRows = rows.filter((values) => !valuesAreEmpty(values)).map((values, index) => rowFromValues(values, index + 2, columns));
        validateRawRows(rawRows, headerErrors).then(resolve).catch(reject);
      },
      error: (error: Error) => reject(error),
    });
  });
}

/** Parses .xlsx, .csv, and .txt files using one header and row contract. */
export async function parseProductFile(file: File): Promise<ImportResult> {
  if (file.size > PRODUCT_IMPORT_MAX_FILE_BYTES) return emptyResult([{ rowNum: 1, message: `This file is too large. The maximum supported size is ${Math.round(PRODUCT_IMPORT_MAX_FILE_BYTES / (1024 * 1024))} MB.` }]);
  const lowerName = file.name.toLowerCase();
  const looksLikeXlsx = lowerName.endsWith(".xlsx") || (await isXlsxMagicBytes(file));
  if (looksLikeXlsx) return parseExcelFile(file);
  if (!lowerName.endsWith(".csv") && !lowerName.endsWith(".txt")) return emptyResult([{ rowNum: 1, message: "Unsupported file type. Use .xlsx, .csv, or .txt." }]);
  return parseTextFile(file);
}

async function isXlsxMagicBytes(file: File): Promise<boolean> {
  try {
    const head = await file.slice(0, 4).arrayBuffer();
    const bytes = new Uint8Array(head);
    return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  } catch {
    return false;
  }
}

export function buildErrorReportCsv(errors: ImportResult["errors"]): string {
  return Papa.unparse([["row", "field", "message"], ...errors.map((error) => [String(error.rowNum), error.field ?? "", error.message])]);
}

function applyTemplateDataValidation(
  sheet: { getCell: (address: string) => { dataValidation?: unknown } },
  column: string,
  validation: Record<string, unknown> | ((rowNumber: number) => Record<string, unknown>),
): void {
  for (let rowNumber = TEMPLATE_START_ROW; rowNumber <= TEMPLATE_END_ROW; rowNumber += 1) {
    sheet.getCell(`${column}${rowNumber}`).dataValidation = typeof validation === "function" ? validation(rowNumber) : validation;
  }
}

function styleTemplateHeader(row: { height?: number; eachCell: (callback: (cell: { font: unknown; fill: unknown; alignment: unknown; border: unknown; note?: unknown }) => void) => void }): void {
  row.height = 34;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0A6E4D" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      bottom: { style: "medium", color: { argb: "FF064E3B" } },
    };
  });
}

function addTemplateGuide(workbook: { addWorksheet: (name: string) => { addRow: (values: unknown[]) => { height?: number; eachCell: (callback: (cell: { font: unknown; fill: unknown; alignment: unknown }) => void) => void }; columns: unknown; views: unknown; getColumn: (index: number) => { numFmt?: string } } }): void {
  const guide = workbook.addWorksheet("Guide");
  const guideHeader = guide.addRow(["Column", "What to enter", "Required", "Allowed format", "Example"]);
  guideHeader.height = 30;
  guideHeader.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  [
    ["Product name", "Product name", "Yes", "Text", "Tomato paste"],
    ["SKU", "Your unique product code. Leave blank to generate one.", "No", "Text", "TOMATO-001"],
    ["Barcode", "Barcode digits. Keep this as text so leading zeroes are preserved.", "No", "Text", "6900001234567"],
    ["Cost price", "What one base unit costs you.", "Yes", "Number, 0 or more", "120"],
    ["Sell price", "What one base unit sells for.", "Yes", "Number, 0 or more", "180"],
    ["Unit", "The base unit you count and sell.", "No", "Text", "tin"],
    ["Low-stock alert", "Alert when stock reaches this number.", "No", "Whole number, 0 or more", "12"],
    ["Expiry tracking", "Choose whether an expiry date is used.", "No", "off, optional, or mandatory", "off"],
    ["Expiry date", "Expiry date when tracking is optional or mandatory.", "Conditional", "Excel date or YYYY-MM-DD", "2027-04-05"],
    ["Opening stock", "Opening quantity at the selected branch.", "No", "Whole number, 0 or more", "40"],
  ].forEach((row) => guide.addRow(row));
  guide.columns = [
    { width: 23 }, { width: 54 }, { width: 14 }, { width: 30 }, { width: 22 },
  ];
  guide.views = [{ state: "frozen", ySplit: 1 }];
  guide.getColumn(3).numFmt = "@";
}

/** Builds the exact .xlsx header contract used by the parser, with workbook-level guidance and validation. */
export async function buildSampleExcel(): Promise<Blob> {
  const excelModule = await import("exceljs");
  const ExcelJS = (excelModule.default && typeof excelModule.default === "object" ? excelModule.default : excelModule) as typeof excelModule;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Product import template";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Products");
  const headerRow = sheet.addRow([...TEMPLATE_HEADERS]);
  styleTemplateHeader(headerRow);
  sheet.columns = [
    { width: 25 }, { width: 18 }, { width: 20 }, { width: 16 }, { width: 16 },
    { width: 15 }, { width: 21 }, { width: 18 }, { width: 17 }, { width: 18 },
  ];
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: `A1`, to: `J${TEMPLATE_END_ROW}` };
  sheet.properties.defaultRowHeight = 22;
  sheet.getRow(1).eachCell((cell) => {
    cell.note = "Use the Guide sheet for the required field, format, and allowed values.";
  });

  // Show a usable writing area while keeping the template safe to upload as-is.
  for (let rowNumber = TEMPLATE_START_ROW; rowNumber < TEMPLATE_START_ROW + TEMPLATE_STARTER_ROWS; rowNumber += 1) {
    const row = sheet.addRow(Array.from({ length: IMPORT_HEADERS.length }, () => ""));
    row.height = 22;
    row.eachCell((cell, columnNumber) => {
      cell.alignment = { vertical: "middle" };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: rowNumber % 2 === 0 ? "FFF8FAFC" : "FFFFFFFF" },
      };
      cell.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } } };
      if (columnNumber === 1 || columnNumber === 2 || columnNumber === 3 || columnNumber === 6) cell.numFmt = "@";
      if (columnNumber === 4 || columnNumber === 5) cell.numFmt = "#,##0.00";
      if (columnNumber === 7 || columnNumber === 10) cell.numFmt = "0";
      if (columnNumber === 9) cell.numFmt = "yyyy-mm-dd";
    });
  }

  applyTemplateDataValidation(sheet, "A", (rowNumber) => ({
    type: "custom",
    formulae: [`=LEN(TRIM(A${rowNumber}))>0`],
    allowBlank: false,
    showErrorMessage: true,
    errorTitle: "Enter a product name",
    error: "Product name is required.",
    showInputMessage: true,
    promptTitle: "Product name",
    prompt: "Enter the name customers will see.",
  }));
  applyTemplateDataValidation(sheet, "D", {
    type: "decimal",
    operator: "greaterThanOrEqual",
    formulae: [0],
    allowBlank: false,
    showErrorMessage: true,
    errorTitle: "Enter a valid cost price",
    error: "Use a number equal to or greater than 0.",
    showInputMessage: true,
    promptTitle: "Cost price",
    prompt: "Numbers only. Do not include a currency symbol.",
  });
  applyTemplateDataValidation(sheet, "E", {
    type: "decimal",
    operator: "greaterThanOrEqual",
    formulae: [0],
    allowBlank: false,
    showErrorMessage: true,
    errorTitle: "Enter a valid selling price",
    error: "Use a number equal to or greater than 0.",
    showInputMessage: true,
    promptTitle: "Selling price",
    prompt: "Numbers only. Do not include a currency symbol.",
  });
  for (const column of ["G", "J"]) {
    applyTemplateDataValidation(sheet, column, {
      type: "whole",
      operator: "greaterThanOrEqual",
      formulae: [0],
      allowBlank: true,
      showErrorMessage: true,
      errorTitle: "Enter a whole number",
      error: "Use a whole number equal to or greater than 0.",
      showInputMessage: true,
      promptTitle: column === "G" ? "Low-stock alert" : "Opening quantity",
      prompt: "Use whole numbers only.",
    });
  }
  applyTemplateDataValidation(sheet, "H", {
    type: "list",
    formulae: ['"off,optional,mandatory"'],
    allowBlank: true,
    showErrorMessage: true,
    errorTitle: "Choose an expiry option",
    error: "Choose off, optional, or mandatory from the dropdown.",
    showInputMessage: true,
    promptTitle: "Expiry tracking",
    prompt: "Choose an option from the dropdown.",
  });
  applyTemplateDataValidation(sheet, "I", (rowNumber) => ({
    type: "custom",
    formulae: [`=OR(I${rowNumber}=\"\",AND(ISNUMBER(I${rowNumber}),I${rowNumber}>=DATE(1900,1,1),I${rowNumber}<=DATE(9999,12,31)))`],
    allowBlank: true,
    showErrorMessage: true,
    errorTitle: "Enter a valid expiry date",
    error: "Use an Excel date or YYYY-MM-DD.",
    showInputMessage: true,
    promptTitle: "Expiry date",
    prompt: "Leave blank when expiry tracking is off.",
  }));

  addTemplateGuide(workbook);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
