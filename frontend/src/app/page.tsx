"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DatabaseZap } from "lucide-react";
import { StateCard } from "@/components/ui/StateCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { getBrandingConfig } from "@/config/branding";
import { recoverStartupWorkspace, resolveStartupDestination, withStartupTimeout } from "@/features/auth/startup-route";

type StartupState = "opening" | "failed" | "recovering" | "blocked";

/** Routes into onboarding or straight to the dashboard based on local state, no network round trip. */
export default function Home() {
  const router = useRouter();
  const branding = getBrandingConfig();
  const [startupState, setStartupState] = useState<StartupState>("opening");
  const attemptRef = useRef(0);
  const startupBeganRef = useRef(false);

  const startRouting = useCallback(() => {
    const attempt = ++attemptRef.current;
    void withStartupTimeout(resolveStartupDestination()).then(
      (destination) => {
        if (attempt === attemptRef.current) router.replace(destination);
      },
      (error) => {
        if (attempt !== attemptRef.current) return;
        console.error("[StartupRoute] Could not read local app state:", error);
        setStartupState("failed");
      },
    );
  }, [router]);

  const repairLocalWorkspace = useCallback(() => {
    const attempt = ++attemptRef.current;
    setStartupState("recovering");
    void recoverStartupWorkspace().then((recovered) => {
      if (attempt !== attemptRef.current) return;
      if (!recovered) {
        setStartupState("blocked");
        return;
      }
      setStartupState("opening");
      startRouting();
    });
  }, [startRouting]);

  useEffect(() => {
    if (startupBeganRef.current) return;
    startupBeganRef.current = true;
    startRouting();
  }, [startRouting]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface px-6 py-8 text-center">
      {startupState === "failed" ? (
        <StateCard
          icon={DatabaseZap}
          tone="warning"
          title="Your saved workspace did not open"
          description="The app could not reach the saved records on this device. Repairing the connection will not delete them."
          action={{ label: "Repair and continue", onClick: repairLocalWorkspace }}
          secondaryAction={{ label: "Open recovery help", onClick: () => router.replace("/offline") }}
        />
      ) : startupState === "blocked" ? (
        <StateCard
          icon={DatabaseZap}
          tone="warning"
          title="Another app tab is still using saved data"
          description="Close every other tab or window for this app, then reload this one. Your saved records remain on this device."
          action={{ label: "Reload after closing tabs", onClick: () => window.location.reload() }}
          secondaryAction={{ label: "Open recovery help", onClick: () => router.replace("/offline") }}
        />
      ) : (
        <section className="w-full max-w-sm" aria-live="polite" aria-label={`Opening ${branding.businessName}`}>
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
    </main>
  );
}
