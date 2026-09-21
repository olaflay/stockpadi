"use client";

import { useEffect } from "react";
import { drainOutbox, recoverStuckSyncingItems, recoverStaleSyncingItems, refreshActiveAccountContext } from "@/features/sync/drain-outbox";
import { preloadSessionData, type SyncPullTrigger } from "@/features/sync/preload-session-data";
import { getSupabase } from "@/lib/supabase";
import { setSyncRuntimePhase } from "@/features/sync/sync-runtime-state";

const ACTIVE_POLL_MS = 3 * 60_000;

/**
 * One orchestration cycle for the only client sync engine. Every trigger uses
 * the same order: recover durable work, refresh worker access state, push the
 * local outbox, then pull the server cursor. A successful push always forces a
 * pull so server canonicalization is reflected locally on the same device.
 */
export async function runSyncCycle(trigger: SyncPullTrigger = "poll"): Promise<void> {
  // Do not even start account/push/pull work while offline. Every local write
  // is already durable in Dexie; the browser's `online` event or the next
  // three-minute online check is the only automatic wake-up path.
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  setSyncRuntimePhase("syncing");
  try {
    await recoverStaleSyncingItems();
    await recoverStuckSyncingItems();
    await refreshActiveAccountContext();
    setSyncRuntimePhase("uploading");
    const pushResult = await drainOutbox();
    setSyncRuntimePhase("downloading");
    await preloadSessionData(pushResult.drained > 0 || trigger !== "poll", pushResult.drained > 0 ? "push-success" : trigger);
  } finally {
    setSyncRuntimePhase("idle");
  }
}

/**
 * Invisible app-level coordinator. The backend currently uses bounded
 * incremental polling as the server-to-device invalidation fallback. It is
 * deliberately restricted to an online boot, reconnect, auth/session
 * restoration, and one three-minute check while the app is visible. Focus
 * and visibility events do not create surprise request bursts; the user can
 * always choose Sync now for an immediate attempt.
 */
export function SyncEngine() {
  useEffect(() => {
    let running = false;
    let queuedTrigger: SyncPullTrigger | null = null;

    const requestRun = (trigger: SyncPullTrigger): void => {
      if (running) {
        queuedTrigger = trigger;
        return;
      }
      running = true;
      void runSyncCycle(trigger)
        .catch(() => {
          // Durable outbox/pull diagnostics are written by the underlying
          // layers. A failed background cycle must not create an unhandled
          // promise rejection or stop later automatic retries.
        })
        .finally(() => {
          running = false;
          if (queuedTrigger) {
            const nextTrigger = queuedTrigger;
            queuedTrigger = null;
            requestRun(nextTrigger);
          }
        });
    };

    const onOnline = () => requestRun("online");
    if (navigator.onLine) requestRun("boot");
    window.addEventListener("online", onOnline);

    const interval = window.setInterval(() => {
      if (navigator.onLine && document.visibilityState !== "hidden") requestRun("poll");
    }, ACTIVE_POLL_MS);

    const supabase = getSupabase();
    const authSubscription = supabase?.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") return;
      // Supabase advises deferring application work from this callback so the
      // auth lock can finish before account-context and sync requests start.
      window.setTimeout(() => requestRun("auth"), 0);
    }).data.subscription;

    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(interval);
      authSubscription?.unsubscribe();
    };
  }, []);

  return null;
}
