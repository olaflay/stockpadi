"use client";

import { useEffect, useState } from "react";

import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { RippleLink } from "@/components/ui/Ripple";
import { useAlertCenter } from "@/features/alerts/use-alert-center";
import { AlertTriangle, CloudOff, PackageMinus, HandCoins, Megaphone } from "lucide-react";
import { RippleButton } from "@/components/ui/Ripple";
import type { AlertType } from "@/features/alerts/get-alerts";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { hasCapability } from "@/features/auth/authorization";

const ALERT_ICONS: Record<AlertType, React.ElementType> = {
  low_stock: PackageMinus,
  expiring: AlertTriangle,
  unsynced: CloudOff,
  customer_credit: HandCoins,
  broadcast: Megaphone,
};

export default function AlertsPage() {
  const user = useCurrentUser();
  const { alerts, isLoading, error, markRead, markViewed, readIds, broadcastError, retryBroadcasts, hasMore, loadMore, loadingMore } = useAlertCenter();
  const [visibleCount, setVisibleCount] = useState(50);
  const allowed = hasCapability(user, "VIEW_ALERTS");

  useEffect(() => {
    if (allowed && !isLoading && !error) markViewed(alerts.map((alert) => alert.id));
  }, [allowed, isLoading, error, alerts, markViewed]);

  if (!hasCapability(user, "VIEW_ALERTS")) {
    return <PermissionDenied requiredCapabilities={["VIEW_ALERTS"]} />;
  }

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 justify-between">
      <ScreenHeader title="Alerts" backHref="/dashboard" />

      <div className="flex-1 flex flex-col justify-between">
        {broadcastError && <div role="status" className="mb-3 rounded-[var(--radius-card)] bg-surface-container p-4 text-on-surface-muted">
          <p>{broadcastError}</p>
          <RippleButton type="button" onClick={retryBroadcasts} className="min-h-[var(--touch-target-min)] text-brand-accent">Try again</RippleButton>
        </div>}
        {isLoading ? (
          <div className="flex flex-col gap-3 py-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : error ? (
          <ErrorState message="Couldn't load alerts." onRetry={() => window.location.reload()} />
        ) : alerts.length === 0 ? (
          <EmptyState
            scene="shop"
            title="All clear"
            description={
              user.accountType === "WORKER"
                ? "No low-stock warnings for your assigned branches right now."
                : "No low stock or expiry warnings right now."
            }
            action={{ label: "Go to Dashboard", href: "/dashboard" }}
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {alerts.slice(0, visibleCount).map((alert) => {
              const Icon = ALERT_ICONS[alert.type];
              const content = <>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-accent/10 text-brand-accent"><Icon size={20} aria-hidden /></div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[length:var(--font-size-body-lg)] font-medium text-on-surface">{alert.title}{!readIds.has(alert.id) && <span className="ml-2 text-[length:var(--font-size-caption)] text-brand-accent">New</span>}</h3>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-[length:var(--font-size-body)] text-on-surface-muted">{alert.description}</p>
                </div>
              </>;
              return (
                <li key={alert.id}>
                  {alert.href ? <RippleLink
                    href={alert.href}
                    onClick={() => markRead([alert.id])}
                    className="flex items-start gap-4 rounded-[var(--radius-card)] bg-surface-container p-4 hover:bg-surface-container-high transition-colors"
                  >
                    {content}
                  </RippleLink> : <div className="flex items-start gap-4 rounded-[var(--radius-card)] bg-surface-container p-4">{content}</div>}
                </li>
              );
            })}
          </ul>
        )}
        {(visibleCount < alerts.length || hasMore) && <RippleButton type="button" disabled={loadingMore} onClick={() => { setVisibleCount((count) => count + 50); if (visibleCount >= alerts.length) loadMore(); }} className="mt-3 min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] border border-border text-on-surface">{loadingMore ? "Loading…" : "Show more"}</RippleButton>}
      </div>
    </div>
  );
}
