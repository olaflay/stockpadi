"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw, WifiOff } from "lucide-react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { RippleButton } from "@/components/ui/Ripple";

export default function OfflinePage() {
  const router = useRouter();

  return (
    <div className="flex min-h-screen flex-col bg-surface p-4 sm:p-6">
      <ScreenHeader title="Offline" hideBack />

      <main className="my-auto flex w-full max-w-md flex-col items-center justify-center self-center py-8 text-center animate-step-in">
        <div className="mb-4 flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-accent/10 text-brand-accent">
          <WifiOff size={30} aria-hidden />
        </div>

        <h1 className="text-[length:var(--font-size-title-lg)] font-bold leading-snug text-on-surface">
          You&apos;re offline
        </h1>

        <p className="mt-2 max-w-sm text-[length:var(--font-size-body)] leading-relaxed text-on-surface-muted">
          Your saved work is safe on this device. Reconnect to open this page.
        </p>

        <div className="mt-6 grid w-full grid-cols-2 gap-3">
          <RippleButton
            type="button"
            onClick={() => router.back()}
            className="flex min-h-[var(--touch-target-min)] items-center justify-center gap-2 rounded-[var(--radius-control)] border border-border bg-surface px-4 py-2.5 text-[length:var(--font-size-body)] font-medium text-on-surface transition-colors hover:bg-surface-container-high"
          >
            <ArrowLeft size={16} aria-hidden />
            <span>Go back</span>
          </RippleButton>
          <RippleButton
            type="button"
            onClick={() => window.location.reload()}
            className="flex min-h-[var(--touch-target-min)] items-center justify-center gap-2 rounded-[var(--radius-control)] bg-brand-accent px-4 py-2.5 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast transition-opacity hover:opacity-90"
          >
            <RefreshCw size={16} aria-hidden />
            <span>Reload</span>
          </RippleButton>
        </div>
      </main>
    </div>
  );
}
