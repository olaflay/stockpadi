"use client";

import { useState, useEffect, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getAlerts, getAlertCounts, type Alert } from "./get-alerts";
import { usePendingSyncCount } from "@/lib/use-pending-sync-count";
import { useCurrentUserOptional } from "@/features/auth/use-current-user";

const ACKNOWLEDGED_STORAGE_KEY = "stockpadi-alerts-acknowledged";

function useAcknowledgedIds() {
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const stored = localStorage.getItem(ACKNOWLEDGED_STORAGE_KEY);
      if (stored) {
        const parsed = new Set<string>(JSON.parse(stored));
        setTimeout(() => setAcknowledgedIds(parsed), 0);
      }
    } catch {
      // ignore
    }
  }, []);

  return acknowledgedIds;
}

/**
 * Cheap count-only alert query — for high-frequency call sites (the nav
 * badge mounted on every authenticated screen, the dashboard summary).
 * Skips the products.bulkGet + description-string work in getAlerts, since
 * these consumers only ever render a number. Use useAlertCenter() instead
 * only where the full descriptive list is actually rendered (the /alerts
 * page itself).
 */
export function useAlertBadgeCount(): number {
  const unsyncedCount = usePendingSyncCount();
  const acknowledgedIds = useAcknowledgedIds();
  const user = useCurrentUserOptional();
  const branchScope = useMemo(
    () => (user?.accountType === "WORKER" ? user.branchIds ?? [] : null),
    [user]
  );
  const lowStockOnly = user?.accountType === "WORKER";

  return useLiveQuery(
    () => getAlertCounts(unsyncedCount, acknowledgedIds, { branchScope, lowStockOnly }),
    [unsyncedCount, acknowledgedIds, branchScope, lowStockOnly]
  ) ?? 0;
}

export function useAlertCenter() {
  const unsyncedCount = usePendingSyncCount();
  const user = useCurrentUserOptional();
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(new Set());
  const branchScope = useMemo(
    () => (user?.accountType === "WORKER" ? user.branchIds ?? [] : null),
    [user]
  );
  const lowStockOnly = user?.accountType === "WORKER";

  useEffect(() => {
    try {
      const stored = localStorage.getItem(ACKNOWLEDGED_STORAGE_KEY);
      if (stored) {
        const parsed = new Set<string>(JSON.parse(stored));
        setTimeout(() => setAcknowledgedIds(parsed), 0);
      }
    } catch {
      // ignore
    }
  }, []);

  const result = useLiveQuery(async () => {
    try {
      const alerts = await getAlerts(unsyncedCount, { branchScope, lowStockOnly });
      return { alerts, error: null as string | null };
    } catch (err) {
      return { alerts: [] as Alert[], error: err instanceof Error ? err.message : "Couldn't load alerts." };
    }
  }, [unsyncedCount, branchScope, lowStockOnly]);

  // undefined distinctly means "still loading" — do not collapse it into an
  // empty array, or the page can never distinguish loading from caught up.
  const alerts = result?.alerts;
  const activeAlerts = (alerts || []).filter((a) => !acknowledgedIds.has(a.id));

  const acknowledgeAlert = (id: string) => {
    const next = new Set(acknowledgedIds);
    next.add(id);
    setAcknowledgedIds(next);
    localStorage.setItem(ACKNOWLEDGED_STORAGE_KEY, JSON.stringify([...next]));
  };

  const clearAcknowledged = () => {
    setAcknowledgedIds(new Set());
    localStorage.removeItem(ACKNOWLEDGED_STORAGE_KEY);
  };

  return {
    isLoading: result === undefined,
    error: result?.error ?? null,
    alerts: activeAlerts,
    allAlertsCount: alerts?.length ?? 0,
    acknowledgeAlert,
    clearAcknowledged,
  };
}
