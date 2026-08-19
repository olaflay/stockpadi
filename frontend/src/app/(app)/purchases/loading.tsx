import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";

export default function PurchasesLoading() {
  return (
    <div className="flex flex-col gap-4">
      <ScreenHeader title="Restocks" />
      <Skeleton className="h-12 w-full rounded-[var(--radius-control)]" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-16 w-full rounded-[var(--radius-card)]" />
        <Skeleton className="h-16 w-full rounded-[var(--radius-card)]" />
        <Skeleton className="h-16 w-full rounded-[var(--radius-card)]" />
        <Skeleton className="h-16 w-full rounded-[var(--radius-card)]" />
      </div>
    </div>
  );
}
