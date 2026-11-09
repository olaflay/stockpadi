"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DatabaseZap } from "lucide-react";
import { StateCard } from "@/components/ui/StateCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { getBrandingConfig } from "@/config/branding";
import { openStartupDestination, recoverStartupWorkspace, resolveStartupDestination, withStartupTimeout } from "@/features/auth/startup-route";

type StartupState = "opening" | "recovering" | "blocked";

const HYDRATION_WATCHDOG = `
  window.__stockpadiStartupHydrated = false;
  window.setTimeout(function () {
    if (window.__stockpadiStartupHydrated) return;
    var loading = document.querySelector('[data-startup-loading]');
    var recovery = document.querySelector('[data-startup-static-recovery]');
    if (loading) loading.setAttribute('hidden', '');
    if (recovery) recovery.removeAttribute('hidden');
  }, 7000);
`;

/** Routes into onboarding or straight to the dashboard based on local state, no network round trip. */
export default function Home() {
  const router = useRouter();
  const branding = getBrandingConfig();
  const [startupState, setStartupState] = useState<StartupState>("opening");
  const startupBeganRef = useRef(false);

  useEffect(() => {
    (window as typeof window & { __stockpadiStartupHydrated?: boolean }).__stockpadiStartupHydrated = true;
    if (startupBeganRef.current) return;
    startupBeganRef.current = true;
    let cancelled = false;

    const openWorkspace = async () => {
      try {
        const destination = await withStartupTimeout(resolveStartupDestination());
        if (!cancelled) openStartupDestination(destination, router.replace);
        return;
      } catch (error) {
        console.error("[StartupRoute] Could not read local app state:", error);
      }

      if (cancelled) return;
      setStartupState("recovering");
      const recovered = await recoverStartupWorkspace();
      if (cancelled) return;
      if (!recovered) {
        setStartupState("blocked");
        return;
      }

      try {
        const destination = await withStartupTimeout(resolveStartupDestination());
        if (!cancelled) openStartupDestination(destination, router.replace);
      } catch (error) {
        console.error("[StartupRoute] Recovery completed but local routing still failed:", error);
        if (!cancelled) setStartupState("blocked");
      }
    };

    void openWorkspace();
    return () => { cancelled = true; };
  }, [router]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface px-6 py-8 text-center">
      <script dangerouslySetInnerHTML={{ __html: HYDRATION_WATCHDOG }} />
      {startupState === "blocked" ? (
        <StateCard
          icon={DatabaseZap}
          tone="warning"
          title="Another app tab is still using saved data"
          description="Close every other tab or window for this app, then reload this one. Your saved records remain on this device."
          action={{ label: "Reload after closing tabs", onClick: () => window.location.reload() }}
          secondaryAction={{ label: "Open recovery help", onClick: () => router.replace("/offline") }}
        />
      ) : (
        <section data-startup-loading className="w-full max-w-sm" aria-live="polite" aria-label={`Opening ${branding.businessName}`}>
          <div className="mx-auto mb-6 size-14 rounded-full bg-brand-accent/10" />
          <h1 className="text-title-lg font-bold text-on-surface">{branding.businessName}</h1>
          <p className="mt-2 text-body text-on-surface-muted">
            {startupState === "recovering" ? "Repairing the saved workspace" : "Opening saved work on this device"}
          </p>
          <div className="mt-8 space-y-3" aria-hidden="true">
            <Skeleton className="h-16 w-full rounded-card" />
            <Skeleton className="h-16 w-full rounded-card" />
          </div>
        </section>
      )}
      <section
        data-startup-static-recovery
        hidden
        className="w-full max-w-sm rounded-[var(--radius-card)] bg-surface-container p-6 text-center shadow-[var(--shadow-elevation-2)]"
      >
        <DatabaseZap className="mx-auto size-8 text-warning" aria-hidden />
        <h2 className="mt-4 text-title-lg font-bold text-on-surface">The app did not finish opening</h2>
        <p className="mt-2 text-body text-on-surface-muted">The saved screen loaded without the app controls. Your records remain on this device.</p>
        <div className="mt-6 grid gap-2">
          <a className="rounded-[var(--radius-control)] bg-brand-accent px-5 py-3 font-semibold text-brand-accent-contrast" href="/offline.html">
            Open offline recovery
          </a>
          {/* Deliberately native: this recovery path must work when Next/React chunks fail to hydrate. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a className="rounded-[var(--radius-control)] px-5 py-3 font-semibold text-on-surface" href="/">
            Reload app
          </a>
        </div>
      </section>
    </main>
  );
}
