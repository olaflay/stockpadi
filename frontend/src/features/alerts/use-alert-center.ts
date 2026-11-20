"use client";

import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getAlerts, getAlertCounts, type Alert } from "./get-alerts";
import { usePendingSyncCount } from "@/lib/use-pending-sync-count";
import { useCurrentUserOptional } from "@/features/auth/use-current-user";
import { useAlertReadState } from "./alert-read-state";
import { alertScope, useBroadcasts } from "./BroadcastProvider";

function useAlertQueryOptions() {
  const user = useCurrentUserOptional();
  const branches = (user?.branchIds ?? []).join(",");
  const worker = user?.accountType === "WORKER";
  return useMemo(() => ({
    branchScope: worker ? (branches ? branches.split(",") : []) : null,
    lowStockOnly: worker,
  }), [worker, branches]);
}

/** Count unseen conditions, rather than repeatedly counting already-opened alerts. */
export function useAlertBadgeCount(): number {
  const unsyncedCount = usePendingSyncCount();
  const user = useCurrentUserOptional();
  const options = useAlertQueryOptions();
  const { readIds, viewedIds } = useAlertReadState(alertScope(user));
  const { broadcasts } = useBroadcasts();
  const conditions = useLiveQuery(
    () => getAlertCounts(unsyncedCount, new Set([...readIds, ...viewedIds]), options),
    [unsyncedCount, readIds, viewedIds, options, user?.businessId],
  ) ?? 0;
  return conditions + broadcasts.filter((row) => !readIds.has(`broadcast-${row.id}`) && !viewedIds.has(`broadcast-${row.id}`)).length;
}

export function useAlertCenter() {
  const unsyncedCount = usePendingSyncCount();
  const user = useCurrentUserOptional();
  const options = useAlertQueryOptions();
  const { readIds, markRead, markViewed } = useAlertReadState(alertScope(user));
  const feed = useBroadcasts();
  const result = useLiveQuery(async () => {
    try {
      return { alerts: await getAlerts(unsyncedCount, options), error: null as string | null };
    } catch {
      return { alerts: [] as Alert[], error: "Couldn't load alerts." };
    }
  }, [unsyncedCount, options, user?.businessId]);
  const alerts = useMemo(() => [
    ...feed.broadcasts.map((row): Alert => ({
      id: `broadcast-${row.id}`, type: "broadcast", title: "Announcement", description: row.content,
    })),
    ...(result?.alerts ?? []),
  ], [feed.broadcasts, result]);
  return {
    isLoading: result === undefined || (feed.loading && alerts.length === 0),
    error: result?.error ?? null,
    broadcastError: feed.error,
    alerts,
    readIds,
    markRead,
    markViewed,
    allAlertsCount: alerts.length,
    acknowledgeAlert: (id: string) => markRead([id]),
    hasMore: feed.hasMore,
    loadMore: feed.loadMore,
    loadingMore: feed.loading,
    retryBroadcasts: feed.retry,
  };
}
