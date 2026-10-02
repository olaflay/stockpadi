"use client";

import { useRouter } from "next/navigation";
import { Download, Upload, RefreshCw } from "lucide-react";
import { db } from "@/lib/db";
import { tenantArray, getLocalBusinessId } from "@/lib/local-tenant";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { useToast } from "@/components/ui/Toast";
import { RippleButton } from "@/components/ui/Ripple";
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
  const router = useRouter();
  const user = useCurrentUser();
  const { showToast } = useToast();
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
        <ScreenHeader title="Backup" onBack={() => router.push("/settings")} />
        <PermissionDenied requiredAccountType="BUSINESS_OWNER" />
      </div>
    );
  }

  async function handleExportBackup() {
    try {
      const [profile, branches, products, categories, customers, creditMovements, stockMovements, sales, expenses, suppliers, purchases] = await Promise.all([
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
      ]);

      const branding = getBrandingConfig();
      const backupData = {
        appName: branding.businessName.toLowerCase().replace(/\s+/g, "-"),
        legacyAppName: "stockpadi",
        version: 2,
        exportedAt: new Date().toISOString(),
        data: { profile, branches, products, categories, customers, creditMovements, stockMovements, sales, expenses, suppliers, purchases },
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

  async function handleImportBackup(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!confirm("Restore this backup? Your current data on this device will be replaced.")) {
      event.target.value = "";
      return;
    }

    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      const branding = getBrandingConfig();
      const validNames = ["stockpadi", "ojapadi", branding.businessName.toLowerCase().replace(/\s+/g, "-")];

      if (!validNames.includes(backup.appName?.toLowerCase()) && !validNames.includes(backup.legacyAppName?.toLowerCase()) || !backup.data) {
        showToast(`That file doesn't look like an authorized backup. Check the file and try again.`, "danger");
        event.target.value = "";
        return;
      }

      const { branches, products, categories, customers, creditMovements, stockMovements, sales, expenses, suppliers, purchases } = backup.data;
      const activeBusinessId = await getLocalBusinessId();
      const importedRows = [branches, products, categories, customers, creditMovements, stockMovements, sales, expenses, suppliers, purchases]
        .flatMap((rows) => Array.isArray(rows) ? rows : []);
      if (!activeBusinessId || importedRows.some((row) => row.businessId && row.businessId !== activeBusinessId)) {
        showToast("This backup was made for a different shop. It can't be restored here.", "danger");
        event.target.value = "";
        return;
      }

      // The outbox is not part of a backup file. Restoring while this device
      // still holds unsynced changes would revert the ledger to the backup's
      // point in time while those newer changes stay queued, so the operator is
      // asked to resolve the queue first rather than losing it silently.
      const unsyncedCount = await countUnsyncedOutbox(activeBusinessId);
      let discardOutbox = false;
      if (unsyncedCount > 0) {
        discardOutbox = confirm(
          `${unsyncedCount} change${unsyncedCount === 1 ? "" : "s"} on this device ${unsyncedCount === 1 ? "has" : "have"} not synced yet.\n\n` +
            `Restoring now rolls this device back to the backup, but it cannot keep those changes. ` +
            `If you haven't synced yet, cancel and sync first. If these changes are already gone or you no longer need them, continue and discard them.`
        );
        if (!discardOutbox) {
          showToast("Restore cancelled. Your unsynced changes are untouched.", "danger");
          event.target.value = "";
          return;
        }
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
      window.location.reload();
    } catch (error) {
      if (error instanceof UnsyncedBackupRestoreBlocked) {
        showToast(error.message, "danger");
      } else {
        showToast("Couldn't restore the backup. Try a different file.", "danger");
      }
      event.target.value = "";
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
      <ScreenHeader title="Backup" onBack={() => router.push("/settings")} />

      <section className="rounded-2xl bg-surface-container p-4">
        <h2 className="mb-2 text-[length:var(--font-size-label)] font-medium text-on-surface-muted">Sync status</h2>
        <p className="text-[length:var(--font-size-body)] text-on-surface">
          {!online
            ? "Offline — changes stay safely on this device"
            : pendingCount > 0
            ? `${pendingCount} change${pendingCount === 1 ? "" : "s"} waiting to sync`
            : failedCount > 0
              ? "Sync needs attention"
              : fullySynced
                ? "Everything is synced"
                : "Cloud pull has not completed yet"}
        </p>
        {failedCount > 0 && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-[var(--radius-card)] bg-danger-container px-3 py-2">
            <p className="text-[length:var(--font-size-body)] text-on-danger-container">
              {failedCount} change{failedCount === 1 ? "" : "s"} failed to sync
            </p>
            <button
              type="button"
              onClick={() => retryFailedOutboxItems()}
              className="flex items-center gap-1 rounded-[var(--radius-control)] bg-danger/10 px-3 py-1 text-[length:var(--font-size-caption)] font-medium text-on-danger-container"
            >
              <RefreshCw size={14} aria-hidden />
              Retry
            </button>
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
            <input type="file" accept="application/json" onChange={handleImportBackup} className="hidden" />
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
    </div>
  );
}
