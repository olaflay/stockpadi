"use client";

import React from "react";
import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";

interface ScreenHeaderProps {
  title: string;
  /**
   * Optional custom back action. If not provided and hideBack is false,
   * defaults to router.back().
   */
  onBack?: () => void;
  /**
   * If true, hides the back button. For root screens, this yields to the
   * top green app bar (TopStoreHeader) so the page UI shifts up.
   */
  hideBack?: boolean;
  /**
   * Optional right-hand action (e.g. Cancel button, view reports link)
   */
  action?: React.ReactNode;
}

export function ScreenHeader({
  title,
  onBack,
  hideBack = false,
  action,
}: ScreenHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  // On root tab screens, the page title, hamburger menu, and sync indicator
  // are already authoritatively displayed in the top green app bar (TopStoreHeader).
  // Rendering an sr-only heading here ensures semantic accessibility and testability
  // while taking up zero visual pixels so the UI shifts up smoothly.
  if (hideBack) {
    if (!action) {
      return <h1 className="sr-only">{title}</h1>;
    }
    return (
      <div className="mb-3 flex items-center justify-end">
        <h1 className="sr-only">{title}</h1>
        <div className="shrink-0">{action}</div>
      </div>
    );
  }

  return (
    <div className="mb-3.5 sm:mb-4 flex items-center gap-3 sm:gap-3.5 min-h-[44px]">
      <button
        type="button"
        onClick={handleBack}
        aria-label="Go back"
        className="flex h-11 w-11 shrink-0 -ml-1.5 items-center justify-center rounded-full text-on-surface hover:bg-surface-container active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
      >
        <ChevronLeft size={24} aria-hidden />
      </button>

      <h1 className="min-w-0 flex-1 truncate text-xl sm:text-2xl font-bold tracking-tight text-on-surface leading-tight">
        {title}
      </h1>

      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
