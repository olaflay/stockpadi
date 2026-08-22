import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";

export default function SettingsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader title="Settings" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-16 w-full rounded-[var(--radius-card)]" />
        <Skeleton className="h-16 w-full rounded-[var(--radius-card)]" />
        <Skeleton className="h-16 w-full rounded-[var(--radius-card)]" />
        <Skeleton className="h-16 w-full rounded-[var(--radius-card)]" />
        <Skeleton className="h-16 w-full rounded-[var(--radius-card)]" />
      </div>
    </div>
  );
}
