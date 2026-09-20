"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { CheckCircle2, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { Skeleton } from "@/components/ui/Skeleton";
import { RippleButton } from "@/components/ui/Ripple";
import { db } from "@/lib/db";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { useOnlineStatus } from "@/lib/use-online-status";
import { serverGet } from "@/features/operations/server-client";
import { drainOutbox } from "@/features/sync/drain-outbox";
import { preloadSessionData } from "@/features/sync/preload-session-data";
import { useSyncSafety } from "@/lib/use-sync-safety";

export default function SyncHealthPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const online = useOnlineStatus();
  const safety = useSyncSafety();
  const [busy, setBusy] = useState(false);
  const [cloud, setCloud] = useState<"unknown" | "connected" | "failed">("unknown");
  const businessId = user.businessId;
  const snapshot = useLiveQuery(async () => {
    if (!businessId) return undefined;
    const [outbox, state, diagnostics] = await Promise.all([db.outbox.toArray(), db.syncPullState.get(`${businessId}:session`), db.syncDiagnostics.toArray()]);
    const active = outbox.filter((row) => row.businessId === businessId);
    const unsynced = active.filter((row) => ["pending", "syncing", "blocked", "failed", "conflict"].includes(row.status));
    const oldestPendingAt = unsynced.map((row) => row.createdAtLocal).filter(Boolean).sort()[0] ?? null;
    return { pending: active.filter((row) => ["pending", "syncing"].includes(row.status)).length, blocked: active.filter((row) => row.status === "blocked").length, issues: active.filter((row) => ["failed", "conflict"].includes(row.status)).length, retries: active.reduce((total, row) => total + (row.attemptCount ?? 0), 0), oldestPendingAt, state, diagnostics: diagnostics.filter((row) => row.businessId === businessId) };
  }, [businessId]);

  useEffect(() => {
    if (!online) return;
    void serverGet("/api/sync/health").then(() => setCloud("connected")).catch(() => setCloud("failed"));
  }, [online]);

  if (user.accountType !== "BUSINESS_OWNER") return <><ScreenHeader title="Sync and system health" onBack={() => router.push("/settings")} /><PermissionDenied requiredAccountType="BUSINESS_OWNER" /></>;
  if (!snapshot) return <><ScreenHeader title="Sync and system health" onBack={() => router.push("/settings")} /><Skeleton className="h-48" /></>;

  const pullFailed = Boolean(snapshot.state?.partialErrors.length) || snapshot.diagnostics.some((item) => !item.success);
  const complete = online && cloud === "connected" && Boolean(snapshot.state?.lastCompletePullAt) && snapshot.pending === 0 && snapshot.blocked === 0 && snapshot.issues === 0 && !pullFailed && !safety.required;
  const status = !online ? "Offline" : cloud === "failed" ? "Service unavailable" : safety.required ? "Sync required" : snapshot.issues > 0 ? "Conflict / attention required" : pullFailed ? "Attention required" : complete ? "Healthy" : "Pending";
  async function syncNow() {
    setBusy(true);
    try { await drainOutbox(); await preloadSessionData(true); } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-4 pb-12">
      <ScreenHeader title="Sync and system health" onBack={() => router.push("/settings")} />
      <section className="rounded-[var(--radius-card)] bg-surface-container p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success-container text-on-success-container"><CheckCircle2 size={24} aria-hidden /></div>
          <div><h2 className="text-[length:var(--font-size-body-lg)] font-semibold text-on-surface">{status}</h2><p className="text-[length:var(--font-size-caption)] text-on-surface-muted">{complete ? "Cloud and this device have completed a complete pull." : "Some changes or datasets still need attention."}</p></div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-[length:var(--font-size-caption)]">
          <p className="rounded-[var(--radius-control)] bg-surface-container-high p-3">{online ? <Wifi className="mr-1 inline" size={14} /> : <WifiOff className="mr-1 inline" size={14} />} Internet: {online ? "Connected" : "Offline"}</p>
          <p className="rounded-[var(--radius-control)] bg-surface-container-high p-3">Cloud: {cloud === "connected" ? "Connected" : cloud === "failed" ? "Unavailable" : "Checking"}</p>
          <p className="rounded-[var(--radius-control)] bg-surface-container-high p-3">Pending: {snapshot.pending}</p>
          <p className="rounded-[var(--radius-control)] bg-surface-container-high p-3">Issues: {snapshot.blocked + snapshot.issues}</p>
          <p className="rounded-[var(--radius-control)] bg-surface-container-high p-3">Retries: {snapshot.retries}</p>
          <p className="rounded-[var(--radius-control)] bg-surface-container-high p-3">Oldest pending: {snapshot.oldestPendingAt ? new Date(snapshot.oldestPendingAt).toLocaleString() : "None"}</p>
          <p className="rounded-[var(--radius-control)] bg-surface-container-high p-3">Branch scope: {user.branchIds?.length ? `${user.branchIds.length} assigned` : "All permitted"}</p>
        </div>
      </section>
      <RippleButton type="button" onClick={syncNow} disabled={busy || !online} className="flex min-h-[var(--touch-target-min)] items-center justify-center gap-2 rounded-[var(--radius-control)] bg-brand-accent px-4 text-brand-accent-contrast disabled:opacity-50"><RefreshCw size={18} className={busy ? "animate-spin" : ""} aria-hidden />{busy ? "Syncing…" : "Sync now"}</RippleButton>
      <section className="rounded-[var(--radius-card)] bg-surface-container p-4">
        <h2 className="mb-3 text-[length:var(--font-size-body-lg)] font-semibold text-on-surface">Pull status</h2>
        <p className="text-[length:var(--font-size-body)] text-on-surface-muted">Last complete pull: {snapshot.state?.lastCompletePullAt ? new Date(snapshot.state.lastCompletePullAt).toLocaleString() : "Not completed yet"}</p>
        <p className="mt-1 text-[length:var(--font-size-caption)] text-on-surface-muted">Pages received: {snapshot.state?.pagesFetched ?? 0}</p>
        <p className="mt-1 text-[length:var(--font-size-caption)] text-on-surface-muted">Last successful push: {snapshot.state?.lastSuccessfulPushAt ? new Date(snapshot.state.lastSuccessfulPushAt).toLocaleString() : "None recorded"}</p>
        <p className="mt-1 text-[length:var(--font-size-caption)] text-on-surface-muted">Last trigger: {snapshot.state?.lastPullTrigger ?? "None recorded"} · Backend contact: {snapshot.state?.lastServerContactAt ? new Date(snapshot.state.lastServerContactAt).toLocaleString() : "None recorded"}</p>
        <p className="mt-1 break-all text-[length:var(--font-size-caption)] text-on-surface-muted">Cursor: {snapshot.state?.cursor ?? "Initial pull"}</p>
        {snapshot.state?.partialErrors.length ? <p className="mt-3 rounded-[var(--radius-control)] bg-danger-container p-3 text-on-danger-container">Some data could not be refreshed. Keep the app online and try again.</p> : null}
      </section>
      <section className="rounded-[var(--radius-card)] bg-surface-container p-4">
        <h2 className="mb-3 text-[length:var(--font-size-body-lg)] font-semibold text-on-surface">Datasets</h2>
        <div className="flex flex-col gap-2">{snapshot.diagnostics.map((item) => <div key={item.id} className="flex items-center justify-between border-b border-border py-2 text-[length:var(--font-size-caption)]"><span className="text-on-surface">{item.entity}</span><span className={item.success ? "text-success" : "text-danger"}>{item.success ? `${item.recordsApplied} received` : "Needs refresh"}</span></div>)}</div>
      </section>
    </div>
  );
}
