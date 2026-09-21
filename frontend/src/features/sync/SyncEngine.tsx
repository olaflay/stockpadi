"use client";

import { useEffect } from "react";
import { drainOutbox, recoverStuckSyncingItems, recoverStaleSyncingItems, refreshActiveAccountContext } from "@/features/sync/drain-outbox";
import { preloadSessionData, type SyncPullTrigger } from "@/features/sync/preload-session-data";
import { getSupabase } from "@/lib/supabase";
import { setSyncRuntimePhase } from "@/features/sync/sync-runtime-state";

const ACTIVE_POLL_MS = 30_000;

/**
 * One orchestration cycle for the only client sync engine. Every trigger uses
 * the same order: recover durable work, refresh worker access state, push the
 * local outbox, then pull the server cursor. A successful push always forces a
 * pull so server canonicalization is reflected locally on the same device.
 */
export async function runSyncCycle(trigger: SyncPullTrigger = "poll"): Promise<void> {
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
 * deliberately paused while hidden and immediately resumed on foreground,
 * focus, reconnect, and auth/session restoration. No user action is needed.
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
    const onFocus = () => requestRun("focus");
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") requestRun("visibility");
    };

    requestRun("boot");
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    const interval = window.setInterval(() => {
      if (document.visibilityState !== "hidden") requestRun("poll");
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
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(interval);
      authSubscription?.unsubscribe();
    };
  }, []);

  return null;
}
