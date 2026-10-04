import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Standard Next.js App Router streaming loading fallback for the (app) route group.
 * Provides instant 0ms visual feedback on page navigation matching Samsung One UI layout:
 * - Top header placeholder
 * - Tonal hero card placeholder
 * - Divided flat list row placeholders
 */
export default function AppLoading() {
  return (
    <div className="flex flex-col gap-4 animate-step-in w-full pb-16">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between py-1">
        <Skeleton className="h-8 w-36 rounded-xl" />
        <Skeleton className="h-8 w-20 rounded-full" />
      </div>

      {/* Hero Focus Block Skeleton */}
      <Skeleton className="h-28 w-full rounded-3xl" />

      {/* Segmented Filter Control Placeholder */}
      <div className="flex gap-2">
        <Skeleton className="h-9 w-24 rounded-full" />
        <Skeleton className="h-9 w-24 rounded-full" />
        <Skeleton className="h-9 w-24 rounded-full" />
      </div>

      {/* Divided Flat List Skeletons */}
      <div className="divide-y divide-outline-variant/30 rounded-3xl bg-surface-container/60 border border-outline-variant/30 overflow-hidden shadow-xs">
        <div className="flex items-center justify-between px-4 py-3.5 gap-3">
          <div className="flex-1 flex flex-col gap-1.5">
            <Skeleton className="h-4 w-40 rounded" />
            <Skeleton className="h-3 w-24 rounded" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-4 py-3.5 gap-3">
          <div className="flex-1 flex flex-col gap-1.5">
            <Skeleton className="h-4 w-32 rounded" />
            <Skeleton className="h-3 w-20 rounded" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-4 py-3.5 gap-3">
          <div className="flex-1 flex flex-col gap-1.5">
            <Skeleton className="h-4 w-48 rounded" />
            <Skeleton className="h-3 w-28 rounded" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-4 py-3.5 gap-3">
          <div className="flex-1 flex flex-col gap-1.5">
            <Skeleton className="h-4 w-36 rounded" />
            <Skeleton className="h-3 w-24 rounded" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      </div>
    </div>
  );
}
