"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DatabaseZap } from "lucide-react";
import { StateCard } from "@/components/ui/StateCard";
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
  const { replace } = useRouter();
  const branding = getBrandingConfig();
  const [startupState, setStartupState] = useState<StartupState>("opening");
  const startupRead = useRef<ReturnType<typeof resolveStartupDestination> | null>(null);

  useEffect(() => {
    (window as typeof window & { __stockpadiStartupHydrated?: boolean }).__stockpadiStartupHydrated = true;
    const initialRead = startupRead.current ??= withStartupTimeout(resolveStartupDestination());
    let cancelled = false;

    const openWorkspace = async () => {
      try {
        const destination = await initialRead;
        if (!cancelled) openStartupDestination(destination, replace);
        return;
      } catch (error) {
        if (!cancelled) console.error("[StartupRoute] Could not read local app state:", error);
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
        if (!cancelled) openStartupDestination(destination, replace);
      } catch (error) {
        console.error("[StartupRoute] Recovery completed but local routing still failed:", error);
        if (!cancelled) setStartupState("blocked");
      }
    };

    void openWorkspace();
    return () => { cancelled = true; };
  }, [replace]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface px-6 py-8 text-center">
      <script dangerouslySetInnerHTML={{ __html: HYDRATION_WATCHDOG }} />
      {startupState === "blocked" ? (
        <StateCard
          icon={DatabaseZap}
          tone="warning"
          title="Couldn’t open the app"
          description="If the app is open elsewhere on this device, close it there and try again."
          action={{ label: "Try again", onClick: () => window.location.reload() }}
          secondaryAction={{ label: "Recovery help", onClick: () => replace("/offline") }}
        />
      ) : (
        <section data-startup-loading className="w-full max-w-sm">
          <h1 role="status" className="text-title-lg font-bold text-on-surface">
            {startupState === "recovering" ? "Still opening…" : `Opening ${branding.businessName}…`}
          </h1>
          <progress aria-hidden="true" className="mx-auto mt-4 block h-1 w-32 accent-brand-accent motion-reduce:hidden" />
        </section>
      )}
      <section
        data-startup-static-recovery
        hidden
        className="w-full max-w-sm rounded-[var(--radius-card)] bg-surface-container p-6 text-center shadow-[var(--shadow-elevation-2)]"
      >
        <DatabaseZap className="mx-auto size-8 text-warning" aria-hidden />
        <h2 className="mt-4 text-title-lg font-bold text-on-surface">Couldn’t open the app</h2>
        <p className="mt-2 text-body text-on-surface-muted">Try again or open recovery help.</p>
        <div className="mt-6 grid gap-2">
          {/* Deliberately native: this recovery path must work when Next/React chunks fail to hydrate. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a className="rounded-[var(--radius-control)] bg-brand-accent px-5 py-3 font-semibold text-brand-accent-contrast" href="/">
            Try again
          </a>
          <a className="rounded-[var(--radius-control)] px-5 py-3 font-semibold text-on-surface" href="/offline.html">
            Recovery help
          </a>
        </div>
      </section>
    </main>
  );
}
