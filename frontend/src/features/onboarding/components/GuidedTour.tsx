"use client";

import { useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";

const STORAGE_KEY = "stockpadi.guided-tour.v1";
const STEPS = [
  { title: "Add products", body: "Create products and opening stock so your shelf is ready.", href: "/products", target: "tour-products" },
  { title: "Make a first sale", body: "Search an item, adjust its quantity, and review the cart.", href: "/pos", target: "tour-pos-item" },
  { title: "Track customers owing", body: "Attach a customer to a credit sale and record repayments.", href: "/customers", target: "tour-customers" },
  { title: "Keep stock in sync", body: "The app works offline; reconnect before Close Day and watch Sync health.", href: "/settings/sync-health", target: "tour-sync" },
];

export function GuidedTour() {
  const pathname = usePathname();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [reopen, setReopen] = useState(false);
  const tourStatus = useSyncExternalStore(
    (onStoreChange) => { window.addEventListener("stockpadi-tour-change", onStoreChange); return () => window.removeEventListener("stockpadi-tour-change", onStoreChange); },
    () => window.localStorage.getItem(STORAGE_KEY) ?? "new",
    () => "loading",
  );
  const open = reopen || (tourStatus !== "loading" && tourStatus !== "complete");
  const current = STEPS[step];
  const isOnTargetRoute = pathname === current.href;

  function finish() {
    window.localStorage.setItem(STORAGE_KEY, "complete");
    setReopen(false);
    window.dispatchEvent(new Event("stockpadi-tour-change"));
  }

  if (!open) {
    return tourStatus === "loading" ? null : (
      <button type="button" onClick={() => { setStep(0); setReopen(true); }} className="fixed bottom-24 right-4 z-30 rounded-full bg-surface-container-high px-3 py-2 text-xs font-semibold text-on-surface shadow-md">
        Guide
      </button>
    );
  }

  return (
    <aside className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-md rounded-[var(--radius-card)] bg-surface-container-high p-4 shadow-[var(--shadow-elevation-3)]" aria-label="StockPadi guided tour">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-accent">Step {step + 1} of {STEPS.length}</p>
      <h2 className="mt-1 text-lg font-semibold text-on-surface">{current.title}</h2>
      <p className="mt-1 text-sm text-on-surface-muted">{current.body}</p>
      <div className="mt-4 flex items-center justify-between gap-2">
        <button type="button" onClick={finish} className="min-h-10 px-3 text-sm text-on-surface-muted">Skip</button>
        <div className="flex gap-2">
          {!isOnTargetRoute && <button type="button" onClick={() => router.push(current.href)} className="min-h-10 rounded-[var(--radius-control)] bg-surface-container px-3 text-sm font-medium text-on-surface">Open</button>}
          <button type="button" onClick={() => step === STEPS.length - 1 ? finish() : setStep((value) => value + 1)} className="min-h-10 rounded-[var(--radius-control)] bg-brand-accent px-3 text-sm font-medium text-brand-accent-contrast">{step === STEPS.length - 1 ? "Done" : "Next"}</button>
        </div>
      </div>
    </aside>
  );
}
