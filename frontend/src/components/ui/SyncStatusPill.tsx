"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { useCurrentUserOptional } from "@/features/auth/use-current-user";
import { useSyncRuntimePhase } from "@/features/sync/sync-runtime-state";
import { db } from "@/lib/db";
import { useOnlineStatus } from "@/lib/use-online-status";
import { ACTIVE_OUTBOX_STATUSES } from "@/lib/use-pending-sync-count";

export function SyncStatusPill() {
  const online = useOnlineStatus();
  const phase = useSyncRuntimePhase();
  const businessId = useCurrentUserOptional()?.businessId;
  const result = useLiveQuery(async () => {
    if (!businessId) return;
    return db.transaction("r", [db.outbox, db.syncPullState], async () => {
      const [entries, pull] = await Promise.all([
        db.outbox.where("status").anyOf(...ACTIVE_OUTBOX_STATUSES)
          .and((row) => row.businessId === businessId).toArray(),
        db.syncPullState.get(`${businessId}:session`),
      ]);
      return {
        businessId,
        pending: entries.length > 0,
        needsReview: entries.some(({ status }) => status === "failed" || status === "conflict" || status === "needs_review") ||
          (pull?.lastPullStatus === "failed" && !pull.nextPullAttemptAt),
        retrying: pull?.lastPullStatus === "failed" && Boolean(pull.nextPullAttemptAt),
        confirmed: Boolean(pull?.lastCompletePullAt),
      };
    });
  }, [businessId]);

  const state = result?.businessId === businessId ? result : undefined;
  const label = !online ? "Offline" : state?.needsReview ? "Review"
    : state?.pending && (phase === "syncing" || phase === "uploading") ? "Saving"
    : state?.pending || state?.retrying ? "Pending"
    : state?.confirmed ? "Saved" : "Checking";
  const detail = label === "Offline" ? "Offline. Sales stay on this device." : label;

  return (
    <Link
      href="/settings/sync-health"
      prefetch={false}
      aria-label={`Sync status: ${detail}`}
      className="inline-flex min-h-[var(--touch-target-min)] shrink-0 items-center rounded-full focus-visible:outline-2 focus-visible:-outline-offset-2"
    >
      <span role="status" className="inline-flex items-center gap-1.5 rounded-full bg-surface-container-high px-2.5 py-1 text-[length:var(--font-size-caption)] leading-tight text-on-surface">
        {state?.needsReview && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-danger" />}
        {label}
      </span>
    </Link>
  );
}
