"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CLIENT_COMPATIBILITY_VERSION } from "@stockpadi/contracts/config";
import { useSyncRuntimePhase } from "@/features/sync/sync-runtime-state";
import { ensureBackendBuildCompatibility } from "@/features/sync/build-compatibility";
import { PWA_DATA_REFRESH_EVENT, PWA_DATABASE_BLOCKED_EVENT, PWA_DATABASE_READY_EVENT, PWA_UPDATE_REQUIRED_EVENT } from "@/lib/pwa-update-events";
import { beginPwaCriticalActivity, hasPwaCriticalActivity } from "@/lib/pwa-update-activity";
import { persistFormDraftsForReload, restoreFormDraftsAfterReload } from "@/lib/pwa-reload-drafts";

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const MAX_SAFE_WAIT_MS = 7_500;
const RELOAD_LOOP_KEY = "stockpadi-pwa-auto-reload-attempt-v1";

/** Registers the versioned worker, updates in the background, and preserves UI drafts across reloads. */
export function ServiceWorkerRegister() {
  const router = useRouter();
  const syncPhase = useSyncRuntimePhase();
  const [fallbackVisible, setFallbackVisible] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("An app update is ready.");
  const [databaseBlocked, setDatabaseBlocked] = useState(false);
  const databaseBlockedRef = useRef(false);
  const syncPhaseRef = useRef(syncPhase);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const registrationPromise = useRef<Promise<ServiceWorkerRegistration> | null>(null);
  const updateCheckPromise = useRef<Promise<void> | null>(null);
  const reloadRequested = useRef(false);
  const reloadTimer = useRef<number | null>(null);
  const reloadStartedAt = useRef(0);
  const activationRequested = useRef(false);
  const failureCount = useRef(0);
  const hadController = useRef(false);
  const disposed = useRef(false);

  useEffect(() => {
    syncPhaseRef.current = syncPhase;
  }, [syncPhase]);

  const showFallback = useCallback((message?: string) => {
    if (message) setUpdateMessage(message);
    setFallbackVisible(true);
  }, []);

  const persistDraftsAndReload = useCallback(() => {
    persistFormDraftsForReload();
    window.location.reload();
  }, []);

  const scheduleSafeReload = useCallback(() => {
    if (reloadTimer.current !== null) return;
    reloadRequested.current = true;
    reloadStartedAt.current = Date.now();
    const appBuild = process.env.NEXT_PUBLIC_BUILD_VERSION ?? "local";
    const reloadIdentity = `${appBuild}:${CLIENT_COMPATIBILITY_VERSION}`;
    try {
      if (window.sessionStorage.getItem(RELOAD_LOOP_KEY) === reloadIdentity) {
        showFallback("The update did not finish. Tap Update now to try again.");
        return;
      }
    } catch {
      // Storage being unavailable must not block a worker update.
    }

    const checkSafeMoment = () => {
      reloadTimer.current = null;
      if (disposed.current || !reloadRequested.current) return;
      const waited = Date.now() - reloadStartedAt.current;
      const safe = syncPhaseRef.current === "idle" && !hasPwaCriticalActivity();
      if (!safe && waited < MAX_SAFE_WAIT_MS) {
        reloadTimer.current = window.setTimeout(checkSafeMoment, 200);
        return;
      }
      try { window.sessionStorage.setItem(RELOAD_LOOP_KEY, reloadIdentity); } catch { /* best effort loop guard */ }
      persistDraftsAndReload();
    };
    reloadTimer.current = window.setTimeout(checkSafeMoment, 0);
  }, [persistDraftsAndReload, showFallback]);

  const activateWaitingWorker = useCallback(() => {
    const waiting = registrationRef.current?.waiting;
    if (!waiting || activationRequested.current) return;
    activationRequested.current = true;
    waiting.postMessage({ type: "SKIP_WAITING" });
  }, []);

  const refreshCurrentData = useCallback(() => {
    if (typeof navigator !== "undefined" && navigator.onLine) {
      void ensureBackendBuildCompatibility(true);
    }
  }, []);

  useEffect(() => {
    disposed.current = false;
    restoreFormDraftsAfterReload();
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !(window.location.protocol === "https:" || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ) return;

    const reportUpdateFailure = (error?: unknown) => {
      failureCount.current += 1;
      if (failureCount.current >= 3) showFallback("Update paused. Saved on phone.");
      if (process.env.NODE_ENV !== "production" && error) console.debug("[PWA] Update check did not complete.", error);
    };
    const observeUpdateSuccess = () => { failureCount.current = 0; };
    const watchInstallingWorker = (worker: ServiceWorker) => {
      const onStateChange = () => {
        if (disposed.current || worker.state !== "installed" || !navigator.serviceWorker.controller) return;
        activationRequested.current = false;
        activateWaitingWorker();
      };
      worker.addEventListener("statechange", onStateChange);
      onStateChange();
    };
    const onUpdateFound = () => {
      const installing = registrationRef.current?.installing;
      if (installing) watchInstallingWorker(installing);
    };
    const attachRegistration = (registration: ServiceWorkerRegistration) => {
      if (registrationRef.current === registration) return registration;
      registrationRef.current = registration;
      hadController.current = Boolean(navigator.serviceWorker.controller);
      registration.addEventListener("updatefound", onUpdateFound);
      if (registration.installing) watchInstallingWorker(registration.installing);
      if (registration.waiting && hadController.current) activateWaitingWorker();
      return registration;
    };
    const ensureRegistration = (): Promise<ServiceWorkerRegistration> => {
      if (registrationRef.current) return Promise.resolve(registrationRef.current);
      if (registrationPromise.current) return registrationPromise.current;
      registrationPromise.current = navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then(attachRegistration)
        .finally(() => { registrationPromise.current = null; });
      return registrationPromise.current;
    };
    const updateRegistration = (): Promise<void> => {
      if (updateCheckPromise.current) return updateCheckPromise.current;
      const check = (async () => {
        try {
          const registration = await ensureRegistration();
          await registration.update();
          observeUpdateSuccess();
          if (registration.waiting && hadController.current) activateWaitingWorker();
        } catch (error) {
          reportUpdateFailure(error);
        }
      })();
      updateCheckPromise.current = check.finally(() => { updateCheckPromise.current = null; });
      return updateCheckPromise.current;
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshCurrentData();
        void updateRegistration();
      }
    };
    const onFocus = () => { refreshCurrentData(); void updateRegistration(); };
    const onPageShow = () => { refreshCurrentData(); void updateRegistration(); };
    const onOnline = () => { refreshCurrentData(); void updateRegistration(); };
    const onControllerChange = () => {
      if (!navigator.serviceWorker.controller) return;
      if (!hadController.current) {
        hadController.current = true;
        return;
      }
      scheduleSafeReload();
    };
    const onUpdateRequired = (event: Event) => {
      const reason = (event as CustomEvent<{ reason?: string }>).detail?.reason;
      setUpdateMessage(reason || "An app update is ready.");
      activationRequested.current = false;
      void updateRegistration();
      scheduleSafeReload();
    };
    const onDatabaseBlocked = () => {
      databaseBlockedRef.current = true;
      setDatabaseBlocked(true);
    };
    const onDatabaseReady = () => {
      const wasBlocked = databaseBlockedRef.current;
      databaseBlockedRef.current = false;
      setDatabaseBlocked(false);
      if (wasBlocked || reloadRequested.current) {
        void updateRegistration();
        scheduleSafeReload();
      }
    };
    const onDataRefresh = () => refreshCurrentData();
    const activeFormTimers = new Map<HTMLFormElement, { timer: number; finish: () => void }>();
    const onFormSubmit = (event: Event) => {
      const form = event.target instanceof HTMLFormElement ? event.target : null;
      if (!form) return;
      const prior = activeFormTimers.get(form);
      if (prior) {
        window.clearTimeout(prior.timer);
        prior.finish();
      }
      const finish = beginPwaCriticalActivity("form-submit");
      const timer = window.setTimeout(() => {
        finish();
        activeFormTimers.delete(form);
      }, MAX_SAFE_WAIT_MS);
      activeFormTimers.set(form, { timer, finish });
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    window.addEventListener(PWA_UPDATE_REQUIRED_EVENT, onUpdateRequired);
    window.addEventListener(PWA_DATABASE_BLOCKED_EVENT, onDatabaseBlocked);
    window.addEventListener(PWA_DATABASE_READY_EVENT, onDatabaseReady);
    window.addEventListener(PWA_DATA_REFRESH_EVENT, onDataRefresh);
    document.addEventListener("submit", onFormSubmit);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);

    void updateRegistration();
    const periodicUpdateCheck = window.setInterval(() => {
      if (document.visibilityState === "visible") void updateRegistration();
    }, UPDATE_CHECK_INTERVAL_MS);

    return () => {
      disposed.current = true;
      window.clearInterval(periodicUpdateCheck);
      if (reloadTimer.current !== null) window.clearTimeout(reloadTimer.current);
      for (const activity of activeFormTimers.values()) {
        window.clearTimeout(activity.timer);
        activity.finish();
      }
      activeFormTimers.clear();
      document.removeEventListener("submit", onFormSubmit);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      window.removeEventListener(PWA_UPDATE_REQUIRED_EVENT, onUpdateRequired);
      window.removeEventListener(PWA_DATABASE_BLOCKED_EVENT, onDatabaseBlocked);
      window.removeEventListener(PWA_DATABASE_READY_EVENT, onDatabaseReady);
      window.removeEventListener(PWA_DATA_REFRESH_EVENT, onDataRefresh);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      registrationRef.current?.removeEventListener("updatefound", onUpdateFound);
      registrationRef.current = null;
    };
  }, [activateWaitingWorker, refreshCurrentData, scheduleSafeReload, showFallback]);

  const updateNow = async () => {
    setFallbackVisible(false);
    activationRequested.current = false;
    try {
      const registration = registrationRef.current ?? await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      registrationRef.current = registration;
      await registration.update();
      if (registration.waiting) {
        activationRequested.current = false;
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
        try { window.sessionStorage.setItem(RELOAD_LOOP_KEY, `manual:${Date.now()}`); } catch { /* best effort retry override */ }
        scheduleSafeReload();
        return;
      }
    } catch {
      // The full document request below is still a useful fallback if a worker check is unavailable.
    }
    persistFormDraftsForReload();
    window.location.reload();
  };

  if (!fallbackVisible && !databaseBlocked) return null;
  const message = databaseBlocked
    ? "Close this app in other tabs or windows to finish updating safely."
    : updateMessage;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom,1rem))] z-[9998] mx-auto flex w-auto max-w-lg items-center gap-3 rounded-[var(--radius-control)] border border-brand-accent/20 bg-surface-container-high px-3.5 py-3 text-on-surface shadow-[var(--shadow-elevation-3)]"
    >
      <RefreshCw size={18} className="shrink-0 text-brand-accent" aria-hidden />
      <p className="min-w-0 flex-1 text-[length:var(--font-size-caption)] font-medium leading-snug">{message}</p>
      {fallbackVisible && !databaseBlocked && (
        <button
          type="button"
          onClick={() => void updateNow()}
          className="shrink-0 rounded-[var(--radius-control)] bg-brand-accent px-3 py-2 text-[length:var(--font-size-caption)] font-semibold text-brand-accent-contrast"
        >
          Update now
        </button>
      )}
    </div>
  );
}
