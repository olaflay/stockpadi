"use client";

import { useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Compass,
  PackagePlus,
  Receipt,
  Users,
  RefreshCw,
  X,
  ChevronRight,
} from "lucide-react";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { getBrandingConfig } from "@/config/branding";

export const TOUR_CHANGE_EVENT = "stockpadi-tour-change";

export const TOUR_STEPS = [
  {
    title: "Add products & stock",
    targetName: "Products",
    body: "Create products with barcode and opening stock so your inventory is ready for sales.",
    href: "/products",
    icon: PackagePlus,
  },
  {
    title: "Make your first sale",
    targetName: "Sell",
    body: "Search an item, adjust quantity with instant steppers, and review your cart.",
    href: "/pos",
    icon: Receipt,
  },
  {
    title: "Track customer credit",
    targetName: "Customers",
    body: "Attach customer records to credit sales and track debt aging and repayments.",
    href: "/customers",
    icon: Users,
  },
  {
    title: "Offline-first sync",
    targetName: "Sync Health",
    body: "Everything works offline without internet; changes merge automatically when reconnected.",
    href: "/settings/sync-health",
    icon: RefreshCw,
  },
];

export function GuidedTour() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useCurrentUser();
  const [step, setStep] = useState(0);
  const [reopen, setReopen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const branding = getBrandingConfig();

  const storageKey = `stockpadi.guided-tour.v2:${user.id}`;
  const tourStatus = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener(TOUR_CHANGE_EVENT, onStoreChange);
      return () => window.removeEventListener(TOUR_CHANGE_EVENT, onStoreChange);
    },
    () => window.localStorage.getItem(storageKey) ?? "new",
    () => "loading",
  );

  const open = !minimized && (reopen || (tourStatus !== "loading" && tourStatus !== "complete"));
  const current = TOUR_STEPS[step] || TOUR_STEPS[0];
  const StepIcon = current.icon;
  const isOnTargetRoute = pathname === current.href;

  function finish() {
    window.localStorage.setItem(storageKey, "complete");
    setReopen(false);
    setMinimized(false);
    window.dispatchEvent(new Event(TOUR_CHANGE_EVENT));
  }

  function minimize() {
    setReopen(false);
    setMinimized(true);
  }

  function startOrResume() {
    setMinimized(false);
    setReopen(true);
  }

  // Minimized state: Positioned at bottom-LEFT (opposite FAB at bottom-right)
  // This guarantees zero collision with the primary action FAB!
  if (!open) {
    if (tourStatus === "loading" || tourStatus === "complete") return null;

    return (
      <button
        type="button"
        onClick={startOrResume}
        className="fixed bottom-22 sm:bottom-24 left-4 z-30 flex items-center gap-1.5 min-h-[var(--touch-target-min)] rounded-full bg-brand-container px-3.5 py-1.5 text-xs font-semibold text-on-brand-container shadow-[var(--shadow-elevation-2)] active:scale-95 transition-all hover:bg-brand-container/90"
        aria-label="Open guided tour"
      >
        <Compass size={15} aria-hidden />
        <span>Guide</span>
        <span className="ml-0.5 rounded-full bg-on-brand-container/15 px-1.5 py-0.5 text-[10px] tabular-nums">
          {step + 1}/{TOUR_STEPS.length}
        </span>
      </button>
    );
  }

  return (
    <>
      {/* Light backdrop */}
      <div
        role="presentation"
        aria-hidden="true"
        onClick={minimize}
        className="fixed inset-0 z-40 bg-black/25 animate-step-in"
      />

      {/* M3 Interactive Tour Sheet */}
      <aside
        role="dialog"
        aria-modal="true"
        className="fixed inset-x-4 bottom-20 sm:bottom-24 z-50 mx-auto max-w-md rounded-2xl border border-border/80 bg-surface-container-high p-5 shadow-[var(--shadow-elevation-3)] animate-sheet-up"
        aria-label={`${branding.businessName} guided tour`}
      >
        {/* Header with step category, X close */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-container text-on-brand-container">
              <StepIcon size={18} aria-hidden />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-brand-accent">
                Step {step + 1} of {TOUR_STEPS.length}
              </p>
              <h2 className="text-base sm:text-lg font-bold text-on-surface leading-tight">
                {current.title}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={minimize}
            className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-muted hover:bg-surface-container hover:text-on-surface active:scale-95 transition-all"
            aria-label="Minimize tour"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        {/* Step description */}
        <p className="mt-2.5 text-xs sm:text-sm text-on-surface-muted leading-relaxed">
          {current.body}
        </p>

        {/* M3 Step Dots Stepper */}
        <div
          className="mt-4 flex items-center justify-center gap-1.5"
          aria-label={`Step ${step + 1} of ${TOUR_STEPS.length}`}
        >
          {TOUR_STEPS.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setStep(i)}
              aria-label={`Go to step ${i + 1}`}
              className={`h-2 rounded-full transition-all duration-200 ${
                i === step
                  ? "w-6 bg-brand-accent"
                  : i < step
                  ? "w-2 bg-brand-accent/50"
                  : "w-2 bg-outline-variant"
              }`}
            />
          ))}
        </div>

        {/* Action controls */}
        <div className="mt-4 flex items-center justify-between gap-2 pt-3 border-t border-border/40">
          <button
            type="button"
            onClick={finish}
            className="min-h-9 px-2 text-xs font-medium text-on-surface-muted hover:text-on-surface transition-colors"
          >
            Skip tour
          </button>

          <div className="flex items-center gap-2">
            {!isOnTargetRoute && (
              <button
                type="button"
                onClick={() => router.push(current.href)}
                className="flex min-h-9 items-center gap-1.5 rounded-xl bg-surface-container px-3 text-xs font-semibold text-on-surface hover:bg-surface-container-highest transition-colors active:scale-95"
              >
                <span>Open {current.targetName}</span>
                <ChevronRight size={14} aria-hidden />
              </button>
            )}
            <button
              type="button"
              onClick={() => (step === TOUR_STEPS.length - 1 ? finish() : setStep((v) => v + 1))}
              className="flex min-h-9 items-center gap-1.5 rounded-xl bg-brand-accent px-3.5 text-xs font-semibold text-brand-accent-contrast hover:opacity-95 transition-opacity active:scale-95"
            >
              <span>{step === TOUR_STEPS.length - 1 ? "Finish tour" : "Next"}</span>
              {step < TOUR_STEPS.length - 1 && <ChevronRight size={14} aria-hidden />}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
