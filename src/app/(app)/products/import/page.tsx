"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Download, Upload, AlertCircle } from "lucide-react";
import { db } from "@/lib/db";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { useToast } from "@/components/ui/Toast";
import { RippleButton } from "@/components/ui/Ripple";
import { SelectInput } from "@/components/ui/SelectInput";
import { useCurrentUser, hasRole } from "@/features/auth/use-current-user";
import { parseProductCsv, buildSampleCsv, type CsvImportResult } from "@/features/inventory/csv-import";
import { importProducts } from "@/features/inventory/import-products";

const CAN_EDIT_PRODUCTS = ["owner", "manager", "inventory_staff", "admin"] as const;

export default function ImportProductsPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const { showToast } = useToast();
  
  const branches = useLiveQuery(() => db.branches.toArray(), [], []);
  const [branchId, setBranchId] = useState<string | null>(null);
  
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<CsvImportResult | null>(null);

  if (!hasRole(user, [...CAN_EDIT_PRODUCTS])) {
    return (
      <div>
        <ScreenHeader title="Import Products" onBack={() => router.back()} />
        <PermissionDenied requiredRoles={[...CAN_EDIT_PRODUCTS]} />
      </div>
    );
  }

  const handleDownloadSample = () => {
    const csv = buildSampleCsv();
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "stockpadi-products-sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    
    setFile(selected);
    setIsParsing(true);
    try {
      const parsed = await parseProductCsv(selected);
      setResult(parsed);
    } catch {
      showToast("Failed to parse CSV file", "danger");
      setResult(null);
    } finally {
      setIsParsing(false);
    }
  };

  const effectiveBranchId = branchId ?? (branches?.length === 1 ? branches[0].id : null);
  const hasInitialStock = result?.validRows.some(r => r.hasInitialStock) ?? false;

  const handleImport = async () => {
    if (!result || result.validRows.length === 0) return;
    if (hasInitialStock && !effectiveBranchId) {
      showToast("Please select a branch for the initial stock.", "warning");
      return;
    }

    setIsImporting(true);
    try {
      await importProducts(result.validRows, user, effectiveBranchId);
      showToast(`Successfully imported ${result.validRows.length} products`, "success");
      router.push("/products");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to import products", "danger");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader title="Import Products" onBack={() => router.back()} />

      {/* Before you Import checklist */}
      <section className="rounded-[var(--radius-card)] border border-warning/30 bg-warning/5 p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-warning font-semibold">
          <AlertCircle size={20} />
          <h2 className="text-[length:var(--font-size-body-lg)]">Before you upload</h2>
        </div>
        <p className="text-[length:var(--font-size-body)] text-on-surface-muted leading-relaxed">
          Ensure your product file follows these rules to avoid import errors:
        </p>
        <ul className="list-disc pl-5 text-[length:var(--font-size-body)] text-on-surface flex flex-col gap-2">
          <li><strong>Do not change headers:</strong> Leave the column headers in row 1 exactly as they are.</li>
          <li><strong>Numeric Prices:</strong> Cost and selling prices must contain only numbers (e.g. <code>1200</code>, not <code>₦1,200.00</code>).</li>
          <li><strong>Unique SKUs:</strong> Make sure product names and SKUs/barcodes do not duplicate existing products.</li>
          <li><strong>Initial Stock Branch:</strong> If you specify initial stock, select the branch it belongs to before importing.</li>
        </ul>
      </section>

      <section className="rounded-[var(--radius-card)] border border-border bg-surface-container p-4">
        <h2 className="mb-2 text-[length:var(--font-size-label)] font-medium text-on-surface">1. Download Template</h2>
        <p className="mb-4 text-[length:var(--font-size-body)] text-on-surface-muted">
          Download the sample CSV file, fill in your products, and upload it back here. Do not change the column headers.
        </p>
        <RippleButton
          type="button"
          onClick={handleDownloadSample}
          className="flex min-h-[var(--touch-target-min)] w-full items-center justify-center gap-2 rounded-[var(--radius-control)] border border-border bg-surface px-4 py-2 text-[length:var(--font-size-body)] font-medium text-on-surface hover:bg-surface-container-high transition-colors"
        >
          <Download size={18} />
          Download CSV Template
        </RippleButton>
      </section>

      <section className="rounded-[var(--radius-card)] border border-border bg-surface-container p-4">
        <h2 className="mb-4 text-[length:var(--font-size-label)] font-medium text-on-surface">2. Upload CSV</h2>
        
        <label className="flex min-h-[var(--touch-target-min)] w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] bg-brand-accent px-4 py-2 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast hover:opacity-95 transition-opacity">
          <Upload size={18} />
          {isParsing ? "Parsing..." : "Select File"}
          <input type="file" accept=".csv" onChange={handleFileSelect} className="hidden" />
        </label>
        
        {file && <p className="mt-2 text-[length:var(--font-size-caption)] text-on-surface-muted">Selected: {file.name}</p>}
      </section>

      {result && (
        <section className="rounded-[var(--radius-card)] border border-border bg-surface-container p-4">
          <h2 className="mb-4 text-[length:var(--font-size-label)] font-medium text-on-surface">3. Review & Import</h2>
          
          <div className="mb-4 flex gap-4">
            <div className="flex-1 rounded-[var(--radius-card)] bg-success/10 p-3 border border-success/20 text-success text-center">
              <span className="block text-2xl font-bold">{result.validRows.length}</span>
              <span className="text-xs">Valid Products</span>
            </div>
            <div className="flex-1 rounded-[var(--radius-card)] bg-danger/10 p-3 border border-danger/20 text-danger text-center">
              <span className="block text-2xl font-bold">{result.errors.length}</span>
              <span className="text-xs">Errors</span>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="mb-4 max-h-40 overflow-y-auto rounded border border-border bg-surface text-sm">
              <ul className="divide-y divide-border">
                {result.errors.map((err, i) => (
                  <li key={i} className="p-2 flex gap-2 text-danger">
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    <span>Row {err.rowNum}: {err.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {hasInitialStock && branches && branches.length > 1 && (
            <div className="mb-4">
              <label className="mb-1 block text-[length:var(--font-size-caption)] font-medium text-on-surface">
                Branch for initial stock
              </label>
              <SelectInput value={branchId ?? ""} onChange={(e) => setBranchId(e.target.value)}>
                <option value="" disabled>Select a branch...</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </SelectInput>
            </div>
          )}

          <RippleButton
            type="button"
            onClick={handleImport}
            disabled={result.validRows.length === 0 || isImporting}
            className="flex min-h-[var(--touch-target-min)] w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-brand-accent px-4 py-2 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast disabled:opacity-50 transition-opacity"
          >
            {isImporting ? "Importing..." : `Import ${result.validRows.length} Products`}
          </RippleButton>
        </section>
      )}
    </div>
  );
}
