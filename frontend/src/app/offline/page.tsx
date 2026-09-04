"use client";

import Link from "next/link";
import { WifiOff, ShoppingBag, Package, Users, RefreshCw } from "lucide-react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { RippleButton } from "@/components/ui/Ripple";

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col bg-surface p-4 sm:p-6">
      <ScreenHeader title="Offline Mode" hideBack />

      <main className="my-auto flex flex-col items-center justify-center text-center animate-step-in w-full max-w-md mx-auto py-8">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-accent/10 text-brand-accent shrink-0">
          <WifiOff size={30} aria-hidden />
        </div>

        <h1 className="text-[length:var(--font-size-title-lg)] font-bold text-on-surface leading-snug">
          You&apos;re Offline — StockPadi Still Works
        </h1>

        <p className="mt-2 max-w-sm text-[length:var(--font-size-body)] text-on-surface-muted leading-relaxed">
          No internet connection right now. Your local ledger is running securely on this device. Everything you record will sync automatically when you reconnect.
        </p>

        {/* Actionable navigation cards — Zero Dead Ends */}
        <div className="mt-6 flex flex-col gap-3 w-full">
          <Link
            href="/pos"
            className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-brand-accent/30 bg-brand-accent/5 p-4 text-left transition-all hover:bg-brand-accent/10 active:scale-[0.99]"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-accent text-brand-accent-contrast shrink-0">
                <ShoppingBag size={20} aria-hidden />
              </div>
              <div>
                <p className="font-semibold text-on-surface text-[length:var(--font-size-body)]">
                  Make a Sale (POS)
                </p>
                <p className="text-xs text-on-surface-muted">
                  Full offline checkout, receipts, and split payments
                </p>
              </div>
            </div>
            <span className="text-sm font-bold text-brand-accent">&rarr;</span>
          </Link>

          <div className="grid grid-cols-2 gap-3 w-full">
            <Link
              href="/products"
              className="flex flex-col items-start gap-2 rounded-[var(--radius-card)] border border-border bg-surface-container/60 p-3.5 text-left transition-all hover:bg-surface-container active:scale-[0.99]"
            >
              <Package size={20} className="text-brand-accent" aria-hidden />
              <div>
                <p className="font-semibold text-on-surface text-xs">Inventory</p>
                <p className="text-[11px] text-on-surface-muted">Browse & update</p>
              </div>
            </Link>

            <Link
              href="/customers"
              className="flex flex-col items-start gap-2 rounded-[var(--radius-card)] border border-border bg-surface-container/60 p-3.5 text-left transition-all hover:bg-surface-container active:scale-[0.99]"
            >
              <Users size={20} className="text-brand-accent" aria-hidden />
              <div>
                <p className="font-semibold text-on-surface text-xs">Customer Debts</p>
                <p className="text-[11px] text-on-surface-muted">Track credit</p>
              </div>
            </Link>
          </div>
        </div>

        <div className="mt-6 flex flex-col items-center gap-2 w-full">
          <RippleButton
            type="button"
            onClick={() => window.location.reload()}
            className="w-full min-h-[var(--touch-target-min)] flex items-center justify-center gap-2 rounded-[var(--radius-control)] border border-border bg-surface text-on-surface px-5 py-2.5 text-[length:var(--font-size-body)] font-medium hover:bg-surface-container-high transition-colors"
          >
            <RefreshCw size={16} aria-hidden />
            <span>Check connection again</span>
          </RippleButton>
        </div>
      </main>
    </div>
  );
}
