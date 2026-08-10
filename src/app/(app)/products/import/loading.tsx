import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";

export default function ImportProductsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader title="Import Products" />
      <Skeleton className="h-48 w-full rounded-[var(--radius-card)]" />
      <Skeleton className="h-40 w-full rounded-[var(--radius-card)]" />
      <Skeleton className="h-40 w-full rounded-[var(--radius-card)]" />
    </div>
  );
}
