"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

const EVENT = "alert-read-state-change";
const EMPTY: string[] = [];

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

const memory = new Map<string, string>();
function snapshot(key: string) {
  try { return localStorage.getItem(key) ?? memory.get(key) ?? "[]"; }
  catch { return memory.get(key) ?? "[]"; }
}

/** Read state is device-local, scoped to the signed-in user and business. */
export function useAlertReadState(scope: string) {
  const key = `alerts.read.v1:${scope}`;
  const raw = useSyncExternalStore(subscribe, () => snapshot(key), () => "[]");
  const viewedKey = `alerts.viewed.v1:${scope}`;
  const viewedRaw = useSyncExternalStore(subscribe, () => snapshot(viewedKey), () => "[]");
  const ids = useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(raw);
      return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : EMPTY);
    } catch { return new Set<string>(); }
  }, [raw]);
  const viewedIds = useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(viewedRaw);
      return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : EMPTY);
    } catch { return new Set<string>(); }
  }, [viewedRaw]);
  const markRead = useCallback((readIds: string[]) => {
    let current: unknown;
    try { current = JSON.parse(snapshot(key)); } catch { current = []; }
    const next = new Set<string>(Array.isArray(current) ? current.filter((id): id is string => typeof id === "string") : EMPTY);
    let changed = false;
    for (const id of readIds) {
      if (!next.has(id)) { next.add(id); changed = true; }
    }
    if (!changed) return;
    const value = JSON.stringify([...next]);
    memory.set(key, value);
    try { localStorage.setItem(key, value); } catch { /* Read state still works for this session. */ }
    window.dispatchEvent(new Event(EVENT));
  }, [key]);
  const markViewed = useCallback((viewed: string[]) => {
    const next = new Set(viewedIds);
    let changed = false;
    for (const id of viewed) { if (!next.has(id)) { next.add(id); changed = true; } }
    if (!changed) return;
    const value = JSON.stringify([...next]);
    memory.set(viewedKey, value);
    try { localStorage.setItem(viewedKey, value); } catch { /* Keep this view's state in memory. */ }
    window.dispatchEvent(new Event(EVENT));
  }, [viewedIds, viewedKey]);
  return { readIds: ids, viewedIds, markRead, markViewed };
}
