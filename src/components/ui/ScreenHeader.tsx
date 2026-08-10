"use client";

import { ChevronLeft } from "lucide-react";
import { SyncIndicator } from "@/components/ui/SyncIndicator";
import { useRouter } from "next/navigation";

interface ScreenHeaderProps {
  title: string;
  /**
   * Optional custom back action. If not provided and hideBack is false,
   * defaults to router.back().
   */
  onBack?: () => void;
  /**
   * If true, hides the back button. Useful for the 5 root tab screens.
   */
  hideBack?: boolean;
}

export function ScreenHeader({ title, onBack, hideBack = false }: ScreenHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  return (
    <div className="mb-4 flex items-center gap-2">
      {!hideBack && (
        <button
          type="button"
          onClick={handleBack}
          aria-label="Back"
          className="flex h-[var(--touch-target-min)] w-[var(--touch-target-min)] shrink-0 items-center justify-center rounded-full text-on-surface hover:bg-surface-container-high transition-colors"
        >
          <ChevronLeft size={24} aria-hidden />
        </button>
      )}
      <h1 className="min-w-0 flex-1 truncate text-[length:var(--font-size-body-lg)] font-semibold text-on-surface">
        {title}
      </h1>
      <div className="shrink-0">
        <SyncIndicator />
      </div>
    </div>
  );
}
