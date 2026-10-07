"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AlertTriangle,
  RotateCw,
  FileCheck2,
  Download,
  Upload,
  Clock,
  Receipt,
  Wallet,
  Users,
  Package,
  Layers,
  ArrowRight,
} from "lucide-react";
import { db } from "@/lib/db";
import { getLocalBusinessId } from "@/lib/local-tenant";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { Modal } from "@/components/ui/Modal";
import { TextInput } from "@/components/ui/TextInput";
import { RippleButton } from "@/components/ui/Ripple";
import { useToast } from "@/components/ui/Toast";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { formatCurrency } from "@/lib/format";
import type { SyncQueueItem } from "@/types/sync";
import { markOutboxNeedsReview } from "@/features/sync/reconcile-outbox";

export default function ReconciliationPage() {
  const user = useCurrentUser();
  const { showToast } = useToast();

  const [activeItem, setActiveItem] = useState<SyncQueueItem | null>(null);
  const [reconcileReason, setReconcileReason] = useState("");
  const [isReconcileModalOpen, setIsReconcileModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"all" | "issues" | "pending">("issues");

  const businessId = user.businessId;

  // Live query on all outbox items
  const outboxItems = useLiveQuery(
    async () => {
      const all = await db.outbox.toArray();
      if (!businessId) return all;
      return all.filter((item) => !item.businessId || item.businessId === businessId);
    },
    [businessId],
    []
  );

  if (user.accountType !== "BUSINESS_OWNER" && user.accountType !== "ADMIN") {
    return (
      <div>
        <ScreenHeader title="Sync Reconciliation" backHref="/settings/data" />
        <PermissionDenied requiredAccountType="BUSINESS_OWNER" />
      </div>
    );
  }

  const failedOrConflictItems = (outboxItems ?? []).filter(
    (item) => item.status === "failed" || item.status === "conflict" || item.status === "blocked" || item.status === "needs_review"
  );
  const pendingItems = (outboxItems ?? []).filter(
    (item) => item.status === "pending" || item.status === "syncing"
  );

  const displayedItems =
    filter === "issues"
      ? failedOrConflictItems
      : filter === "pending"
      ? pendingItems
      : outboxItems ?? [];

  async function handleRetry(item: SyncQueueItem) {
    try {
      await db.outbox.update(item.clientId, {
        status: "pending",
        reconciliationStatus: "open",
        reconciliationReason: null,
        reconciledAt: null,
        nextAttemptAt: null,
      });
      showToast("Item queued for immediate sync retry.", "success");
    } catch {
      showToast("Couldn't update sync queue item.", "danger");
    }
  }

  async function handleConfirmReconcile() {
    if (!activeItem) return;
    if (!reconcileReason.trim()) {
      showToast("A reconciliation reason is mandatory for audit compliance.", "danger");
      return;
    }

    setBusy(true);
    try {
      await markOutboxNeedsReview(activeItem, user.id, reconcileReason);

      showToast("Transaction kept safely in the review queue.", "success");
      setIsReconcileModalOpen(false);
      setActiveItem(null);
      setReconcileReason("");
    } catch {
      showToast("Couldn't reconcile item. Try again.", "danger");
    } finally {
      setBusy(false);
    }
  }

  // Emergency Disaster Export: exports outbox mutations to JSON
  async function handleEmergencyExport() {
    if (!outboxItems || outboxItems.length === 0) {
      showToast("No outbox records to export.", "neutral");
      return;
    }

    const payload = {
      type: "ojapadi-emergency-outbox",
      exportedAt: new Date().toISOString(),
      businessId,
      items: outboxItems,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `emergency-outbox-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`${outboxItems.length} unsynced records exported safely.`, "success");
  }

  // Emergency Ingest: imports outbox records from another device
  async function handleEmergencyImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (parsed.type !== "ojapadi-emergency-outbox" || !Array.isArray(parsed.items)) {
        showToast("Invalid emergency outbox archive.", "danger");
        e.target.value = "";
        return;
      }

      const activeId = await getLocalBusinessId();
      if (parsed.businessId && activeId && parsed.businessId !== activeId) {
        showToast("This archive belongs to a different business.", "danger");
        e.target.value = "";
        return;
      }

      let importedCount = 0;
      for (const item of parsed.items) {
        const existing = await db.outbox.get(item.clientId);
        if (!existing) {
          await db.outbox.add({
            ...item,
            status: "pending",
            attemptCount: 0,
            nextAttemptAt: null,
          });
          importedCount++;
        }
      }

      showToast(`Imported ${importedCount} emergency mutations into sync queue.`, "success");
    } catch {
      showToast("Couldn't read emergency export file.", "danger");
    } finally {
      e.target.value = "";
    }
  }

  function getEntityIcon(type: string) {
    switch (type) {
      case "sale":
        return <Receipt size={18} className="text-brand-accent" />;
      case "expense":
        return <Wallet size={18} className="text-warning" />;
      case "customer":
      case "customer_credit":
        return <Users size={18} className="text-brand-accent" />;
      case "product":
      case "stock_movement":
        return <Package size={18} className="text-neutral" />;
      default:
        return <Layers size={18} className="text-neutral" />;
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-24">
      <ScreenHeader title="Sync Reconciliation" backHref="/settings/data" />

      {/* Overview Banner */}
      <section className="flex flex-col gap-3 rounded-2xl bg-surface-container p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-container text-on-brand-container">
            <FileCheck2 size={20} aria-hidden />
          </div>
          <div>
            <h2 className="text-base font-bold text-on-surface">Owner Reconciliation Queue</h2>
            <p className="text-xs text-on-surface-muted">
              Inspect stuck or conflicted offline sales without losing money data.
            </p>
          </div>
        </div>

        {/* Emergency Disaster Transfer Toolbar */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/20">
          <button
            type="button"
            onClick={handleEmergencyExport}
            className="flex items-center gap-1.5 rounded-xl bg-surface-container-high px-3 py-2 text-xs font-semibold text-on-surface hover:bg-surface-container-highest transition-colors"
            title="Export for broken device disaster transfer"
          >
            <Download size={14} />
            <span>Emergency Export</span>
          </button>
          <label className="flex items-center gap-1.5 rounded-xl bg-surface-container-high px-3 py-2 text-xs font-semibold text-on-surface hover:bg-surface-container-highest transition-colors cursor-pointer">
            <Upload size={14} />
            <span>Ingest from Other Device</span>
            <input type="file" accept="application/json" onChange={handleEmergencyImport} className="hidden" />
          </label>
        </div>
      </section>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setFilter("issues")}
          className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
            filter === "issues"
              ? "bg-brand-accent text-brand-accent-contrast shadow-sm"
              : "bg-surface-container text-on-surface-muted hover:bg-surface-container-high"
          }`}
        >
          <AlertTriangle size={14} />
          <span>Issues ({failedOrConflictItems.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setFilter("pending")}
          className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
            filter === "pending"
              ? "bg-brand-accent text-brand-accent-contrast shadow-sm"
              : "bg-surface-container text-on-surface-muted hover:bg-surface-container-high"
          }`}
        >
          <Clock size={14} />
          <span>Pending ({pendingItems.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
            filter === "all"
              ? "bg-brand-accent text-brand-accent-contrast shadow-sm"
              : "bg-surface-container text-on-surface-muted hover:bg-surface-container-high"
          }`}
        >
          <span>All ({outboxItems?.length ?? 0})</span>
        </button>
      </div>

      {/* Queue Items */}
      {displayedItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl bg-surface-container p-8 text-center">
          <FileCheck2 size={36} className="text-on-surface-muted opacity-40 mb-2" />
          <p className="text-base font-semibold text-on-surface">Queue is clear</p>
          <p className="text-xs text-on-surface-muted max-w-xs mt-1">
            {filter === "issues"
              ? "No failed or conflicted transactions require owner review."
              : "No pending offline mutations in this category."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {displayedItems.map((item) => {
            const isIssue = item.status === "failed" || item.status === "conflict" || item.status === "blocked" || item.status === "needs_review";
            const payload = item.payload as Record<string, unknown> | undefined;
            const amount = typeof payload?.total === "number" ? payload.total : typeof payload?.amount === "number" ? payload.amount : null;

            return (
              <div
                key={item.clientId}
                className="flex flex-col gap-3 rounded-2xl bg-surface-container p-4 shadow-sm border border-border/10"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-container-high">
                      {getEntityIcon(item.type)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-on-surface capitalize">{item.type.replace(/_/g, " ")}</p>
                        <span
                          className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            isIssue ? "bg-danger-container text-on-danger-container" : "bg-surface-container-high text-on-surface-muted"
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-on-surface-muted mt-0.5">
                        Recorded {new Date(item.createdAtLocal).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {amount !== null && (
                    <div className="text-right">
                      <p className="text-sm font-bold text-on-surface">{formatCurrency(amount)}</p>
                    </div>
                  )}
                </div>

                {/* Error diagnostics */}
                {item.lastError && (
                  <div className="rounded-xl bg-danger-container/40 p-2.5 text-xs text-on-danger-container leading-relaxed">
                    <strong className="font-semibold">Reason:</strong> {item.lastError}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/10">
                  <button
                    type="button"
                    onClick={() => handleRetry(item)}
                    className="flex items-center gap-1.5 rounded-xl bg-surface-container-high px-3 py-2 text-xs font-semibold text-on-surface hover:bg-surface-container-highest transition-colors"
                  >
                    <RotateCw size={13} />
                    <span>Retry Sync</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveItem(item);
                      setIsReconcileModalOpen(true);
                    }}
                    className="flex items-center gap-1.5 rounded-xl bg-brand-accent/15 px-3 py-2 text-xs font-bold text-brand-accent hover:bg-brand-accent/25 transition-colors"
                  >
                    <span>Reconcile & Dismiss</span>
                    <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Mandatory Reconcile Reason Modal */}
      {isReconcileModalOpen && activeItem && (
        <Modal
          title="Reconcile Transaction"
          isOpen={isReconcileModalOpen}
          onClose={() => {
            setIsReconcileModalOpen(false);
            setActiveItem(null);
            setReconcileReason("");
          }}
        >
          <div className="flex flex-col gap-4 text-left">
            <p className="text-xs text-on-surface-muted leading-relaxed">
              This does not delete the mutation or claim that the server applied it. It preserves the original payload for authoritative retry or support review. Enter the reason this item needs review:
            </p>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="reconcile-reason-input" className="text-xs font-semibold text-on-surface-muted">
                Audit Reason (Mandatory)
              </label>
              <TextInput
                id="reconcile-reason-input"
                value={reconcileReason}
                onChange={(e) => setReconcileReason(e.target.value)}
                placeholder="e.g. Cash in drawer verified; manual counter sale registered"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsReconcileModalOpen(false);
                  setActiveItem(null);
                  setReconcileReason("");
                }}
                className="rounded-xl px-4 py-2.5 text-xs font-semibold text-on-surface-muted hover:text-on-surface transition-colors"
              >
                Cancel
              </button>
              <RippleButton
                type="button"
                onClick={handleConfirmReconcile}
                disabled={busy || !reconcileReason.trim()}
                className="rounded-xl bg-brand-accent px-4 py-2.5 text-xs font-bold text-brand-accent-contrast disabled:opacity-50 hover:opacity-95 transition-opacity"
              >
                {busy ? "Saving…" : "Mark Needs Review"}
              </RippleButton>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
