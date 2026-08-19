import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";

export default function NewProductLoading() {
  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader title="Add product" />
      <div className="flex flex-col gap-4">
        {/* Name Input */}
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-12 w-full rounded-[var(--radius-control)]" />
        </div>
        {/* SKU / Barcode */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-12 w-full rounded-[var(--radius-control)]" />
          </div>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-12 w-full rounded-[var(--radius-control)]" />
          </div>
        </div>
        {/* Category */}
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-12 w-full rounded-[var(--radius-control)]" />
        </div>
        {/* Cost / Sell Price */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-12 w-full rounded-[var(--radius-control)]" />
          </div>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-12 w-full rounded-[var(--radius-control)]" />
          </div>
        </div>
        {/* CTA Button */}
        <Skeleton className="h-12 w-full rounded-[var(--radius-control)] mt-4" />
      </div>
    </div>
  );
}
