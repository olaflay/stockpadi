import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";

export default function PosLoading() {
  return (
    <div className="flex flex-col gap-4">
      <ScreenHeader title="Sell" />
      <Skeleton className="h-12 w-full" />
      <div className="flex gap-2">
        <Skeleton className="h-10 w-24 rounded-[var(--radius-control)]" />
        <Skeleton className="h-10 w-24 rounded-[var(--radius-control)]" />
        <Skeleton className="h-10 w-24 rounded-[var(--radius-control)]" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full rounded-[var(--radius-card)]" />
        <Skeleton className="h-24 w-full rounded-[var(--radius-card)]" />
        <Skeleton className="h-24 w-full rounded-[var(--radius-card)]" />
      </div>
    </div>
  );
}
