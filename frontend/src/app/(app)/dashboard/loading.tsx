import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";

export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-3 pb-6 sm:pb-8">
      <ScreenHeader title="Dashboard" hideBack={true} />

      {/* Hero Sales Card Placeholder */}
      <div className="rounded-3xl p-4 sm:p-5 flex flex-col justify-between h-32 sm:h-34 bg-surface-container/60 border border-outline-variant/20 shadow-xs">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-28 rounded" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-8 w-44 rounded-lg my-1" />
        <div className="flex items-center justify-between">
          <Skeleton className="h-3.5 w-24 rounded" />
          <Skeleton className="h-3.5 w-18 rounded" />
        </div>
      </div>

      {/* Quick Actions Dock Placeholder */}
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 sm:h-18 rounded-2xl" />
        ))}
      </div>

      {/* 2x2 KPI Grid Placeholder */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 sm:h-26 rounded-2xl p-3 bg-surface-container/60 border border-outline-variant/20 flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-3.5 w-16 rounded" />
              <Skeleton className="h-3.5 w-3.5 rounded-full" />
            </div>
            <Skeleton className="h-6 w-24 rounded-md" />
            <Skeleton className="h-3 w-14 rounded" />
          </div>
        ))}
      </div>

      {/* Recent Activity List filling the screen */}
      <div className="rounded-2xl p-3 bg-surface-container/60 border border-outline-variant/20 flex flex-col gap-2.5 mt-1">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3.5 w-28 rounded" />
          <Skeleton className="h-3.5 w-12 rounded" />
        </div>
        <Skeleton className="h-11 w-full rounded-xl" />
        <Skeleton className="h-11 w-full rounded-xl" />
        <Skeleton className="h-11 w-full rounded-xl" />
      </div>
    </div>
  );
}
