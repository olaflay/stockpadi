import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";

export default function ReportsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader title="Reports" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-12 w-full rounded-[var(--radius-control)]" />
        <Skeleton className="h-32 w-full rounded-[var(--radius-card)]" />
        <Skeleton className="h-32 w-full rounded-[var(--radius-card)]" />
        <Skeleton className="h-40 w-full rounded-[var(--radius-card)]" />
      </div>
    </div>
  );
}
