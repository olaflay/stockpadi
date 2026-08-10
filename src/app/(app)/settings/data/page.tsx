"use client";

import { useRouter } from "next/navigation";
import { Download, Upload, RefreshCw } from "lucide-react";
import { db } from "@/lib/db";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { useToast } from "@/components/ui/Toast";
import { RippleButton } from "@/components/ui/Ripple";
import { useCurrentUser, hasRole } from "@/features/auth/use-current-user";
import { usePendingSyncCount, useFailedSyncCount } from "@/lib/use-pending-sync-count";
import { retryFailedOutboxItems } from "@/features/sync/drain-outbox";
import { buildProductsCsv, buildSalesCsv } from "@/features/reports/csv-export";

export default function DataSettingsPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const { showToast } = useToast();
  const pendingCount = usePendingSyncCount();
  const failedCount = useFailedSyncCount();

  if (!hasRole(user, ["owner", "admin"])) {
    return (
      <div>
        <ScreenHeader title="Backup" onBack={() => router.push("/settings")} />
        <PermissionDenied requiredRoles={["owner", "admin"]} />
      </div>
    );
  }

  async function handleExportBackup() {
    try {
      const [profile, branches, products, categories, customers, creditMovements, stockMovements, sales, expenses, suppliers, purchases] = await Promise.all([
        db.businessProfile.toArray(),
        db.branches.toArray(),
        db.products.toArray(),
        db.categories.toArray(),
        db.customers.toArray(),
        db.customerCreditMovements.toArray(),
        db.stockMovements.toArray(),
        db.sales.toArray(),
        db.expenses.toArray(),
        db.suppliers.toArray(),
        db.purchases.toArray(),
      ]);

      const backupData = {
        appName: "stockpadi",
        version: 2,
        exportedAt: new Date().toISOString(),
        data: { profile, branches, products, categories, customers, creditMovements, stockMovements, sales, expenses, suppliers, purchases },
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `stockpadi-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Backup exported successfully", "success");
    } catch {
      showToast("Failed to export backup", "danger");
    }
  }

  async function handleImportBackup(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!confirm("Are you sure you want to restore this backup? This will overwrite all current local data!")) {
      event.target.value = "";
      return;
    }

    try {
      const text = await file.text();
      const backup = JSON.parse(text);

      if (backup.appName !== "stockpadi" || !backup.data) {
        showToast("Invalid backup file format", "danger");
        event.target.value = "";
        return;
      }

      const { profile, branches, products, categories, customers, creditMovements, stockMovements, sales, expenses, suppliers, purchases } = backup.data;

      await db.transaction(
        "rw",
        [db.businessProfile, db.branches, db.products, db.categories, db.customers, db.customerCreditMovements, db.stockMovements, db.sales, db.expenses, db.suppliers, db.purchases],
        async () => {
          if (profile) {
            await db.businessProfile.clear();
            await db.businessProfile.bulkPut(profile);
          }
          if (branches) {
            await db.branches.clear();
            await db.branches.bulkPut(branches);
          }
          if (products) {
            await db.products.clear();
            await db.products.bulkPut(products);
          }
          if (categories) {
            await db.categories.clear();
            await db.categories.bulkPut(categories);
          }
          if (customers) {
            await db.customers.clear();
            await db.customers.bulkPut(customers);
          }
          if (creditMovements) {
            await db.customerCreditMovements.clear();
            await db.customerCreditMovements.bulkPut(creditMovements);
          }
          if (stockMovements) {
            await db.stockMovements.clear();
            await db.stockMovements.bulkPut(stockMovements);
          }
          if (sales) {
            await db.sales.clear();
            await db.sales.bulkPut(sales);
          }
          if (expenses) {
            await db.expenses.clear();
            await db.expenses.bulkPut(expenses);
          }
          if (suppliers) {
            await db.suppliers.clear();
            await db.suppliers.bulkPut(suppliers);
          }
          if (purchases) {
            await db.purchases.clear();
            await db.purchases.bulkPut(purchases);
          }
        }
      );

      showToast("Backup restored successfully", "success");
      window.location.reload();
    } catch (err) {
      showToast("Failed to restore backup: " + (err instanceof Error ? err.message : "unknown error"), "danger");
      event.target.value = "";
    }
  }

  async function handleExportProductsCsv() {
    try {
      const products = await db.products.toArray();
      const csv = buildProductsCsv(products);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `stockpadi-products-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Products CSV exported successfully", "success");
    } catch {
      showToast("Failed to export products CSV", "danger");
    }
  }

  async function handleExportSalesCsv() {
    try {
      const start = new Date();
      start.setDate(1); // Start of this month
      start.setHours(0, 0, 0, 0);
      const sales = await db.sales.where("createdAtLocal").aboveOrEqual(start.toISOString()).toArray();
      const products = await db.products.toArray();
      
      const csv = buildSalesCsv(sales, products);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `stockpadi-sales-this-month.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Sales CSV exported successfully", "success");
    } catch {
      showToast("Failed to export sales CSV", "danger");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader title="Backup" onBack={() => router.push("/settings")} />

      <section className="rounded-[var(--radius-card)] border border-border p-4">
        <h2 className="mb-2 text-[length:var(--font-size-label)] font-medium text-on-surface-muted">Sync status</h2>
        <p className="text-[length:var(--font-size-body)] text-on-surface">
          {pendingCount > 0
            ? `${pendingCount} change${pendingCount === 1 ? "" : "s"} waiting to sync`
            : "Everything is synced"}
        </p>
        {failedCount > 0 && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-[var(--radius-card)] bg-danger-container px-3 py-2">
            <p className="text-[length:var(--font-size-body)] text-on-danger-container">
              {failedCount} change{failedCount === 1 ? "" : "s"} failed to sync
            </p>
            <button
              type="button"
              onClick={() => retryFailedOutboxItems()}
              className="flex items-center gap-1 rounded-[var(--radius-control)] border border-current px-3 py-1 text-[length:var(--font-size-caption)] font-medium text-on-danger-container"
            >
              <RefreshCw size={14} aria-hidden />
              Retry
            </button>
          </div>
        )}
      </section>

      <section className="rounded-[var(--radius-card)] border border-border bg-surface-container p-4">
        <p className="mb-4 text-[length:var(--font-size-body)] leading-relaxed text-on-surface-muted">
          Save a backup of your local database to a file to prevent data loss. You can restore this file on another device.
        </p>
        <div className="flex flex-wrap gap-3">
          <RippleButton
            type="button"
            onClick={handleExportBackup}
            className="flex min-h-[var(--touch-target-min)] items-center justify-center gap-2 rounded-[var(--radius-control)] bg-brand-accent px-4 py-2 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast hover:opacity-95 transition-opacity"
          >
            <Download size={18} />
            Export Backup
          </RippleButton>
          <label className="flex min-h-[var(--touch-target-min)] cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] border border-border bg-surface px-4 py-2 text-[length:var(--font-size-body)] font-medium text-on-surface hover:bg-surface-container-high transition-colors">
            <Upload size={18} />
            Import Backup
            <input type="file" accept="application/json" onChange={handleImportBackup} className="hidden" />
          </label>
        </div>
      </section>
      <section className="rounded-[var(--radius-card)] border border-border bg-surface-container p-4">
        <h2 className="mb-2 text-[length:var(--font-size-label)] font-medium text-on-surface">Export for accounting</h2>
        <p className="mb-4 text-[length:var(--font-size-body)] leading-relaxed text-on-surface-muted">
          Export your products and sales data to CSV for use in spreadsheets or accounting software.
        </p>
        <div className="flex flex-col gap-3">
          <RippleButton
            type="button"
            onClick={handleExportProductsCsv}
            className="flex min-h-[var(--touch-target-min)] w-full items-center justify-center gap-2 rounded-[var(--radius-control)] border border-border bg-surface px-4 py-2 text-[length:var(--font-size-body)] font-medium text-on-surface hover:bg-surface-container-high transition-colors"
          >
            <Download size={18} />
            Export Products CSV
          </RippleButton>
          <RippleButton
            type="button"
            onClick={handleExportSalesCsv}
            className="flex min-h-[var(--touch-target-min)] w-full items-center justify-center gap-2 rounded-[var(--radius-control)] border border-border bg-surface px-4 py-2 text-[length:var(--font-size-body)] font-medium text-on-surface hover:bg-surface-container-high transition-colors"
          >
            <Download size={18} />
            Export Sales CSV — This month
          </RippleButton>
        </div>
      </section>
    </div>
  );
}
