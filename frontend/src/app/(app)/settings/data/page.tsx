"use client";

import { useState } from "react";
import { Download, Upload, RefreshCw } from "lucide-react";
import { db } from "@/lib/db";
import { tenantArray, getLocalBusinessId } from "@/lib/local-tenant";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { useToast } from "@/components/ui/Toast";
import { RippleButton, RippleLink } from "@/components/ui/Ripple";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { usePendingSyncCount, useFailedSyncCount } from "@/lib/use-pending-sync-count";
import { useLiveQuery } from "dexie-react-hooks";
import { useOnlineStatus } from "@/lib/use-online-status";
import { retryFailedOutboxItems } from "@/features/sync/drain-outbox";
import {
  UnsyncedBackupRestoreBlocked,
  countUnsyncedOutbox,
  restoreBackup,
} from "@/features/data/restore-backup";
import { buildProductsCsv, buildSalesCsv } from "@/features/reports/csv-export";
import { getBrandingConfig } from "@/config/branding";

export default function DataSettingsPage() {
  const user = useCurrentUser();
  const { showToast } = useToast();
  const [pendingBackupFile, setPendingBackupFile] = useState<File | null>(null);
  const [unsyncedWarning, setUnsyncedWarning] = useState<{ file: File; count: number } | null>(null);
  const [restoringBackup, setRestoringBackup] = useState(false);
  const pendingCount = usePendingSyncCount();
  const failedCount = useFailedSyncCount();
  const online = useOnlineStatus();
  const businessId = user.businessId;
  const pullState = useLiveQuery(
    () => businessId ? db.syncPullState.get(`${businessId}:session`) : undefined,
    [businessId],
  );
  const fullySynced = online && pendingCount === 0 && failedCount === 0 && Boolean(pullState?.lastCompletePullAt);

  if (user.accountType !== "BUSINESS_OWNER" && user.accountType !== "ADMIN") {
    return (
      <div>
        <ScreenHeader title="Backup" backHref="/settings" />
        <PermissionDenied requiredAccountType="BUSINESS_OWNER" />
      </div>
    );
  }

  async function handleExportBackup() {
    try {
      const [businessProfile, branches, products, categories, customers, customerCreditMovements, stockMovements, sales, expenses, suppliers, purchases, saleRefunds] = await Promise.all([
        db.businessProfile.toArray(),
        tenantArray(db.branches),
        tenantArray(db.products),
        tenantArray(db.categories),
        tenantArray(db.customers),
        tenantArray(db.customerCreditMovements),
        tenantArray(db.stockMovements),
        tenantArray(db.sales),
        tenantArray(db.expenses),
        tenantArray(db.suppliers),
        tenantArray(db.purchases),
        tenantArray(db.saleRefunds),
      ]);

      const branding = getBrandingConfig();
      const backupData = {
        appName: branding.businessName.toLowerCase().replace(/\s+/g, "-"),
        legacyAppName: "stockpadi",
        version: 2,
        exportedAt: new Date().toISOString(),
        data: { businessProfile, branches, products, categories, customers, customerCreditMovements, stockMovements, sales, expenses, suppliers, purchases, saleRefunds },
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Backup downloaded.", "success");
    } catch {
      showToast("Couldn't export the backup. Try again.", "danger");
    }
  }

  function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPendingBackupFile(file);
    event.target.value = "";
  }

  async function proceedWithSelectedBackup(file: File) {
    setPendingBackupFile(null);
    const activeBusinessId = await getLocalBusinessId();
    if (!activeBusinessId) return;
    const unsyncedCount = await countUnsyncedOutbox(activeBusinessId);
    if (unsyncedCount > 0) {
      setUnsyncedWarning({ file, count: unsyncedCount });
      return;
    }
    await executeRestore(file, false);
  }

  async function executeRestore(file: File, discardOutbox: boolean) {
    setRestoringBackup(true);
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      const branding = getBrandingConfig();
      const validNames = ["stockpadi", "ojapadi", branding.businessName.toLowerCase().replace(/\s+/g, "-")];

      if (!validNames.includes(backup.appName?.toLowerCase()) && !validNames.includes(backup.legacyAppName?.toLowerCase()) || !backup.data) {
        showToast(`That file doesn't look like an authorized backup. Check the file and try again.`, "danger");
        return;
      }

      const { businessProfile, branches, products, categories, customers, customerCreditMovements, creditMovements, stockMovements, sales, expenses, suppliers, purchases, saleRefunds } = backup.data;
      const activeBusinessId = await getLocalBusinessId();
      const importedRows = [businessProfile, branches, products, categories, customers, customerCreditMovements ?? creditMovements, stockMovements, sales, expenses, suppliers, purchases, saleRefunds]
        .flatMap((rows) => Array.isArray(rows) ? rows : []);
      if (!activeBusinessId || importedRows.some((row) => row.businessId && row.businessId !== activeBusinessId)) {
        showToast("This backup was made for a different shop. It can't be restored here.", "danger");
        return;
      }

      const result = await restoreBackup(backup.data, {
        businessId: activeBusinessId,
        discardOutbox,
      });

      if (result.discardedOutboxCount > 0) {
        showToast(
          `Backup restored. ${result.discardedOutboxCount} unsynced change${result.discardedOutboxCount === 1 ? "" : "s"} discarded.`,
          "danger"
        );
      } else {
        showToast("Backup restored.", "success");
      }
      setUnsyncedWarning(null);
      window.location.reload();
    } catch (error) {
      if (error instanceof UnsyncedBackupRestoreBlocked) {
        showToast(error.message, "danger");
      } else {
        showToast("Couldn't restore the backup. Try a different file.", "danger");
      }
    } finally {
      setRestoringBackup(false);
    }
  }

  async function handleExportProductsCsv() {
    try {
      const products = await tenantArray(db.products);
      const csv = buildProductsCsv(products);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `products-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Products downloaded as a spreadsheet.", "success");
    } catch {
      showToast("Couldn't export the spreadsheet. Try again.", "danger");
    }
  }

  async function handleExportSalesCsv() {
    try {
      const start = new Date();
      start.setDate(1); // Start of this month
      start.setHours(0, 0, 0, 0);
      const sales = await tenantArray(db.sales.where("createdAtLocal").aboveOrEqual(start.toISOString()));
      const products = await tenantArray(db.products);
      
      const csv = buildSalesCsv(sales, products);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sales-this-month-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Sales downloaded as a spreadsheet.", "success");
    } catch {
      showToast("Couldn't export the spreadsheet. Try again.", "danger");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader title="Backup" backHref="/settings" />

      <section className="rounded-2xl bg-surface-container p-4">
        <h2 className="mb-2 text-[length:var(--font-size-label)] font-medium text-on-surface-muted">Save status</h2>
        <p className="text-[length:var(--font-size-body)] text-on-surface">
          {!online
            ? "Offline. Changes stay on this device."
            : pendingCount > 0
            ? `${pendingCount} change${pendingCount === 1 ? "" : "s"} waiting to upload`
            : failedCount > 0
              ? "Some changes need attention"
              : fullySynced
                ? "Everything is saved"
                : "Still checking for updates"}
        </p>
        {failedCount > 0 ? (
          <div className="mt-3 flex flex-col gap-2 rounded-xl bg-danger-container/40 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-on-danger-container">
                {failedCount} change{failedCount === 1 ? "" : "s"} need attention
              </p>
              <button
                type="button"
                onClick={() => retryFailedOutboxItems()}
                className="flex items-center gap-1 rounded-lg bg-danger/10 px-2.5 py-1 text-xs font-semibold text-on-danger-container"
              >
                <RefreshCw size={12} aria-hidden />
                Retry all
              </button>
            </div>
            <RippleLink
              href="/settings/data/reconciliation"
              className="flex items-center justify-between text-xs font-bold text-brand-accent hover:underline pt-1"
            >
              <span>Review changes that need attention</span>
              <span>→</span>
            </RippleLink>
          </div>
        ) : (
          <div className="mt-3 pt-2 border-t border-border/10">
            <RippleLink
              href="/settings/data/reconciliation"
              className="flex items-center justify-between text-xs font-semibold text-on-surface-muted hover:text-on-surface"
            >
              <span>Review saved changes or move them to another device</span>
              <span>→</span>
            </RippleLink>
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-surface-container p-4">
        <p className="mb-4 text-[length:var(--font-size-body)] leading-relaxed text-on-surface-muted">
          Save a backup of your local database to a file to prevent data loss. You can restore this file on another device.
        </p>
        <div className="flex flex-wrap gap-3">
          <RippleButton
            type="button"
            onClick={handleExportBackup}
            className="flex min-h-[var(--touch-target-min)] items-center justify-center gap-2 rounded-[var(--radius-control)] bg-brand-accent px-4 py-2 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast shadow-sm hover:opacity-95 transition-opacity"
          >
            <Download size={18} />
            Export Backup
          </RippleButton>
          <label className="flex min-h-[var(--touch-target-min)] cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] bg-surface-container-high px-4 py-2 text-[length:var(--font-size-body)] font-medium text-on-surface hover:bg-surface-container-highest transition-colors">
            <Upload size={18} />
            Import Backup
            <input type="file" accept="application/json" onChange={handleFileSelected} className="hidden" />
          </label>
        </div>
      </section>
      <section className="rounded-2xl bg-surface-container p-4">
        <h2 className="mb-2 text-[length:var(--font-size-label)] font-medium text-on-surface">Export for accounting</h2>
        <p className="mb-4 text-[length:var(--font-size-body)] leading-relaxed text-on-surface-muted">
          Export your products and sales data to CSV for use in spreadsheets or accounting software.
        </p>
        <div className="flex flex-col gap-3">
          <RippleButton
            type="button"
            onClick={handleExportProductsCsv}
            className="flex min-h-[var(--touch-target-min)] w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-surface-container-high px-4 py-2 text-[length:var(--font-size-body)] font-medium text-on-surface hover:bg-surface-container-highest transition-colors"
          >
            <Download size={18} />
            Export Products CSV
          </RippleButton>
          <RippleButton
            type="button"
            onClick={handleExportSalesCsv}
            className="flex min-h-[var(--touch-target-min)] w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-surface-container-high px-4 py-2 text-[length:var(--font-size-body)] font-medium text-on-surface hover:bg-surface-container-highest transition-colors"
          >
            <Download size={18} />
            Export Sales CSV (This month)
          </RippleButton>
        </div>
      </section>

      {/* Confirmation before reading and verifying backup */}
      {pendingBackupFile && (
        <ConfirmDialog
          isOpen={pendingBackupFile !== null}
          onClose={() => setPendingBackupFile(null)}
          onConfirm={() => proceedWithSelectedBackup(pendingBackupFile)}
          title="Restore backup?"
          description="This replaces current data on this device with records from your backup file. Make sure you want to overwrite local data."
          confirmLabel="Restore backup"
          cancelLabel="Cancel"
          variant="danger"
        />
      )}

      {/* Confirmation if unsynced changes exist locally */}
      {unsyncedWarning && (
        <ConfirmDialog
          isOpen={unsyncedWarning !== null}
          onClose={() => setUnsyncedWarning(null)}
          onConfirm={() => executeRestore(unsyncedWarning.file, true)}
          isBusy={restoringBackup}
          title="Discard unsynced changes?"
          description={`${unsyncedWarning.count} change${unsyncedWarning.count === 1 ? "" : "s"} on this device haven't synced to the cloud yet. Restoring now will overwrite and permanently remove them.`}
          confirmLabel="Discard & restore"
          cancelLabel="Keep unsynced"
          variant="danger"
        />
      )}
    </div>
  );
}
