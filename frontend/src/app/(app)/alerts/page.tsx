"use client";

import { useRouter } from "next/navigation";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { RippleLink } from "@/components/ui/Ripple";
import { useAlertCenter } from "@/features/alerts/use-alert-center";
import { Bell, AlertTriangle, CloudOff, PackageMinus } from "lucide-react";
import type { AlertType } from "@/features/alerts/get-alerts";

const ALERT_ICONS: Record<AlertType, React.ElementType> = {
  low_stock: PackageMinus,
  expiring: AlertTriangle,
  unsynced: CloudOff,
};

export default function AlertsPage() {
  const router = useRouter();
  const { alerts, isLoading, error, acknowledgeAlert } = useAlertCenter();

  return (
    <div className="flex flex-col min-h-screen">
      <ScreenHeader title="Alerts" onBack={() => router.back()} />

      <div className="flex-1 p-4 pb-20">
        {isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : error ? (
          <ErrorState message="Couldn't load alerts." onRetry={() => window.location.reload()} />
        ) : alerts.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="You're all caught up"
            description="There are no new alerts to review at this time."
            action={{ label: "Go to Dashboard", onClick: () => router.push("/dashboard") }}
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {alerts.map((alert) => {
              const Icon = ALERT_ICONS[alert.type];
              return (
                <li key={alert.id}>
                  <RippleLink
                    href={alert.href}
                    onClick={() => acknowledgeAlert(alert.id)}
                    className="flex items-start gap-4 rounded-[var(--radius-card)] border border-border bg-surface p-4 hover:bg-surface-container active:scale-[0.99] transition-all"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-accent/10 text-brand-accent">
                      <Icon size={20} aria-hidden />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-[length:var(--font-size-body-lg)] font-medium text-on-surface">{alert.title}</h3>
                      <p className="mt-0.5 text-[length:var(--font-size-body)] text-on-surface-muted">
                        {alert.description}
                      </p>
                    </div>
                  </RippleLink>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
