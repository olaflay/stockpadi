"use client";

import React from "react";
import { ChevronLeft } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";

interface ScreenHeaderProps {
  title: string;
  /**
   * Optional custom back action. If not provided and hideBack is false,
   * defaults to router.back().
   */
  onBack?: () => void;
  /**
   * Optional static URL to navigate back to with prefetching and native link semantics.
   * If supplied, takes precedence over router navigation.
   */
  backHref?: string;
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
  backHref,
  hideBack = false,
  action,
}: ScreenHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }

    // In a browser/PWA, if history has entries, router.back() correctly returns
    // to the prior screen the user came from (e.g. Dashboard -> Sales -> Dashboard,
    // or More -> Sales -> More).
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    // Safe fallback when opened directly in a new tab/session with no history
    if (backHref) {
      router.push(backHref);
      return;
    }

    // Default safe fallbacks so user is never stuck
    if (pathname.includes("/settings/")) router.push("/settings");
    else if (pathname.includes("/products/")) router.push("/products");
    else if (pathname.includes("/staff/")) router.push("/staff");
    else if (pathname.includes("/sales/")) router.push("/sales");
    else if (pathname.includes("/contacts/") || pathname.includes("/customers/")) router.push("/contacts");
    else router.push("/dashboard");
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

  const backAffordanceClass =
    "flex h-12 w-12 shrink-0 -ml-2 items-center justify-center rounded-full text-on-surface hover:bg-surface-container active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent";

  return (
    <div className="mb-3.5 sm:mb-4 flex items-center gap-2 sm:gap-2.5 min-h-[48px]">
      <button
        type="button"
        onClick={handleBack}
        aria-label="Go back"
        className={backAffordanceClass}
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
