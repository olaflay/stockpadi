"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Download, Upload, AlertCircle, HelpCircle, CheckCircle2, FileSpreadsheet, Loader2 } from "lucide-react";
import { db } from "@/lib/db";
import { tenantArray } from "@/lib/local-tenant";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { useToast } from "@/components/ui/Toast";
import { RippleButton } from "@/components/ui/Ripple";
import { SelectInput } from "@/components/ui/SelectInput";
import { useCurrentUser, hasAccountType } from "@/features/auth/use-current-user";
import { BUSINESS_MANAGEMENT_ACCOUNT_TYPES } from "@/features/auth/authorization";
import { parseProductCsv, buildSampleCsv, type CsvImportResult } from "@/features/inventory/csv-import";
import { importProducts } from "@/features/inventory/import-products";
import { countActiveProducts } from "@/features/inventory/product-cap";
import { PRODUCT_CAP, PRODUCT_CAP_WARN_AT } from "@/config/limits";

const CAN_EDIT_PRODUCTS = BUSINESS_MANAGEMENT_ACCOUNT_TYPES;

const COLUMN_HELP: Array<{ key: string; label: string; note: string; required?: boolean }> = [
  { key: "name", label: "Product name", note: "What your customers call it.", required: true },
  { key: "sku", label: "SKU / code", note: "Your own short code, e.g. SMP-001. Must be unique.", required: true },
  { key: "barcode", label: "Barcode", note: "Leave blank if you don't scan barcodes." },
  { key: "costPrice", label: "Cost price", note: "Numbers only, no currency symbol, e.g. 1200.", required: true },
  { key: "sellPrice", label: "Selling price", note: "What the customer pays. Numbers only, e.g. 1500.", required: true },
  { key: "unitLabel", label: "Unit", note: "How you sell it: piece, bag, bottle, tin…" },
  { key: "lowStockThreshold", label: "Low-stock alert", note: "Get warned when stock drops to this number. Leave blank to skip." },
  { key: "expiryTracking", label: "Expiry tracking", note: "off, optional, or mandatory." },
  { key: "initialStock", label: "Starting stock", note: "How many you have now. Leave blank or 0 to start at zero." },
];

function StepBadge({ n, text }: { n: number; text: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span
        aria-hidden="true"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-accent text-[length:var(--font-size-label)] font-bold text-brand-accent-contrast"
      >
        {n}
      </span>
      <h2 className="text-[length:var(--font-size-body-lg)] font-semibold text-on-surface">{text}</h2>
    </div>
  );
}

export default function ImportProductsPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const { showToast } = useToast();

  const branches = useLiveQuery(() => tenantArray(db.branches), [], []);
  const [branchId, setBranchId] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [willExceedCap, setWillExceedCap] = useState(false);
  const [willWarnCap, setWillWarnCap] = useState(false);

  if (!hasAccountType(user, CAN_EDIT_PRODUCTS)) {
    return (
      <div>
        <ScreenHeader title="Import products" onBack={() => router.back()} />
        <PermissionDenied requiredAccountTypes={CAN_EDIT_PRODUCTS} />
      </div>
    );
  }

  const handleDownloadSample = () => {
    const csv = buildSampleCsv();
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "stockpadi-products-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    setIsParsing(true);
    setWillExceedCap(false);
    setWillWarnCap(false);
    try {
      const parsed = await parseProductCsv(selected);
      setResult(parsed);

      if (parsed.validRows.length > 0) {
        const used = await countActiveProducts();
        const projected = used + parsed.validRows.length;
        setWillExceedCap(projected > PRODUCT_CAP);
        setWillWarnCap(projected > PRODUCT_CAP_WARN_AT && projected <= PRODUCT_CAP);
      } else {
        setWillExceedCap(false);
        setWillWarnCap(false);
      }
    } catch {
      showToast("We couldn't read that file. Check it's a .csv and try again.", "danger");
      setResult(null);
    } finally {
      setIsParsing(false);
    }
  };

  const effectiveBranchId = branchId ?? (branches?.length === 1 ? branches[0].id : null);
  const hasInitialStock = result?.validRows.some((r) => r.hasInitialStock) ?? false;

  const handleImport = async () => {
    if (!result || result.validRows.length === 0) return;
    if (hasInitialStock && !effectiveBranchId) {
      showToast("Choose which branch this starting stock is at first.", "warning");
      return;
    }
    if (willExceedCap) {
      showToast(`This import is above the ${PRODUCT_CAP}-product cap. Trim the file and try again.`, "danger");
      return;
    }

    setIsImporting(true);
    try {
      await importProducts(result.validRows, user, effectiveBranchId);
      showToast(`Imported ${result.validRows.length} products`, "success");
      router.push("/products");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "We couldn't finish the import. Try again.", "danger");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader title="Import products" onBack={() => router.back()} />

      <p className="text-[length:var(--font-size-body)] text-on-surface-muted">
        Add many products at once by filling in a spreadsheet template, then uploading it.
      </p>

      {/* Step 1 — get the template */}
      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
        <StepBadge n={1} text="Get the template" />
        <RippleButton
          type="button"
          onClick={handleDownloadSample}
          className="flex min-h-[var(--touch-target-min)] w-full items-center justify-center gap-2 rounded-[var(--radius-control)] border border-border bg-surface px-4 text-[length:var(--font-size-body)] font-medium text-on-surface hover:bg-surface-container-high transition-colors"
        >
          <Download size={18} aria-hidden />
          Download template file (Excel / CSV)
        </RippleButton>
        <p className="mt-3 text-[length:var(--font-size-caption)] text-on-surface-muted">
          Opens in Excel, Google Sheets, or Numbers. Fill it in like a spreadsheet, save it, and upload it in the next step.
        </p>

        <details className="mt-4 group">
          <summary className="flex min-h-[var(--touch-target-min)] cursor-pointer items-center gap-2 rounded-[var(--radius-control)] px-1 text-[length:var(--font-size-body)] font-medium text-on-surface list-none [&::-webkit-details-marker]:hidden">
            <HelpCircle size={18} aria-hidden />
            Which column is which?
          </summary>
          <ul className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
            {COLUMN_HELP.map((col) => (
              <li key={col.key} className="flex flex-col gap-0.5">
                <p className="text-[length:var(--font-size-body)] font-medium text-on-surface">
                  {col.label}
                  {col.required && <span className="text-danger"> *</span>}
                  <span className="ml-2 font-number text-on-surface-muted">{col.key}</span>
                </p>
                <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">{col.note}</p>
              </li>
            ))}
          </ul>
        </details>
      </section>

      {/* Step 2 — upload */}
      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
        <StepBadge n={2} text="Upload your file" />
        <label className="flex min-h-[var(--touch-target-min)] w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-[var(--radius-control)] border-2 border-dashed border-border bg-surface-container px-4 py-6 text-center hover:bg-surface-container-high transition-colors">
          <FileSpreadsheet size={26} aria-hidden className="text-on-surface-muted" />
          <span className="text-[length:var(--font-size-body)] font-medium text-on-surface">
            {isParsing ? "Reading your file…" : file ? "Choose a different file" : "Choose your file"}
          </span>
          {!isParsing && (
            <span className="text-[length:var(--font-size-caption)] text-on-surface-muted">
              {file ? file.name : ".csv file from the template above"}
            </span>
          )}
          <input type="file" accept=".csv" onChange={handleFileSelect} className="sr-only" />
        </label>

        {result && (
          <div role="status" aria-live="polite" className="mt-4 flex flex-col gap-3">
            <div className="flex gap-3">
              <div className="flex flex-1 items-center gap-2 rounded-[var(--radius-card)] bg-success/10 p-3 text-success">
                <CheckCircle2 size={18} aria-hidden />
                <span>
                  <span className="block text-2xl font-bold tabular-nums">{result.validRows.length}</span>
                  <span className="text-[length:var(--font-size-caption)]">Ready to import</span>
                </span>
              </div>
              <div
                className={`flex flex-1 items-center gap-2 rounded-[var(--radius-card)] p-3 ${
                  result.errors.length > 0 ? "bg-danger/10 text-danger" : "bg-surface-container text-on-surface-muted"
                }`}
              >
                <AlertCircle size={18} aria-hidden />
                <span>
                  <span className="block text-2xl font-bold tabular-nums">{result.errors.length}</span>
                  <span className="text-[length:var(--font-size-caption)]">Need fixing</span>
                </span>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
                <h3 className="mb-2 text-[length:var(--font-size-label)] font-semibold text-on-surface">
                  Fix these rows, then choose the file again
                </h3>
                <ul className="flex max-h-56 flex-col gap-2 overflow-y-auto">
                  {result.errors.map((err, i) => (
                    <li key={i} className="flex items-start gap-2 rounded-[var(--radius-card)] bg-surface-container px-3 py-2">
                      <AlertCircle size={16} aria-hidden className="mt-0.5 shrink-0 text-danger" />
                      <p className="text-[length:var(--font-size-caption)] text-on-surface">
                        <span className="font-semibold">Row {err.rowNum}</span>
                        {err.field ? ` · ${err.field}` : ""} — {err.message}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {willWarnCap && !willExceedCap && (
              <p className="rounded-[var(--radius-card)] bg-warning/10 px-4 py-3 text-[length:var(--font-size-caption)] text-on-surface">
                Heads up: this file brings you close to the {PRODUCT_CAP}-product cap. That is fine — you can still import it.
              </p>
            )}
            {willExceedCap && (
              <p className="rounded-[var(--radius-card)] bg-danger/10 px-4 py-3 text-[length:var(--font-size-caption)] text-danger">
                This file is above the {PRODUCT_CAP}-product cap for this store. Remove some rows and choose the file again.
              </p>
            )}
          </div>
        )}
      </section>

      {/* Step 3 — review & import */}
      {result && (
        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
          <StepBadge n={3} text="Review and import" />

          {hasInitialStock && branches && branches.length > 1 && (
            <div className="mb-4">
              <label className="mb-1 block text-[length:var(--font-size-caption)] font-medium text-on-surface">
                Branch for starting stock
              </label>
              <SelectInput value={branchId ?? ""} onChange={(e) => setBranchId(e.target.value)}>
                <option value="" disabled>Select a branch…</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </SelectInput>
            </div>
          )}

          <RippleButton
            type="button"
            onClick={handleImport}
            disabled={result.validRows.length === 0 || isImporting || willExceedCap}
            className="flex min-h-[var(--touch-target-min)] w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-brand-accent px-4 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast disabled:opacity-50 transition-opacity"
          >
            {isImporting ? (
              <>
                <Loader2 size={18} className="animate-spin" aria-hidden />
                Importing…
              </>
            ) : (
              <>
                <Upload size={18} aria-hidden />
                Import {result.validRows.length} {result.validRows.length === 1 ? "product" : "products"}
              </>
            )}
          </RippleButton>
        </section>
      )}
    </div>
  );
}
