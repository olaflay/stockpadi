"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Megaphone, X } from "lucide-react";
import { serverGet } from "@/platform/api/backend-client";
import { useCurrentUserOptional } from "@/features/auth/use-current-user";
import { useAlertReadState } from "./alert-read-state";
import { RippleButton, RippleLink } from "@/components/ui/Ripple";

export interface Broadcast { id: string; content: string; created_at: string; }
interface Cursor { before: string; beforeId: string; }
interface BroadcastResult { broadcasts: Broadcast[]; nextCursor: Cursor | null; }
interface Feed { broadcasts: Broadcast[]; loading: boolean; error: string | null; hasMore: boolean; loadMore: () => void; retry: () => void; }
const Context = createContext<Feed>({ broadcasts: [], loading: false, error: null, hasMore: false, loadMore: () => {}, retry: () => {} });

export function alertScope(user: ReturnType<typeof useCurrentUserOptional>) {
  return `${user?.businessId ?? "none"}:${user?.id ?? "anonymous"}`;
}

export function BroadcastProvider({ children }: { children: ReactNode }) {
  const user = useCurrentUserOptional();
  const scope = alertScope(user);
  return <ScopedBroadcastProvider key={scope} scope={scope} enabled={Boolean(user)}>{children}</ScopedBroadcastProvider>;
}

function ScopedBroadcastProvider({ children, enabled, scope }: { children: ReactNode; enabled: boolean; scope: string }) {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>(() => {
    if (typeof navigator === "undefined" || navigator.onLine) return [];
    try {
      const cached = localStorage.getItem(`alerts.broadcasts.v1:${scope}`);
      const parsed: unknown = cached ? JSON.parse(cached) : [];
      return Array.isArray(parsed) ? parsed as Broadcast[] : [];
    } catch { return []; }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const busy = useRef(false);
  const mounted = useRef(false);
  const broadcastsRef = useRef(broadcasts);
  useEffect(() => { broadcastsRef.current = broadcasts; }, [broadcasts]);
  const fetchFeed = useCallback(async (after?: Cursor) => {
    if (!enabled || !navigator.onLine || busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const query = after ? `?${new URLSearchParams({ before: after.before, beforeId: after.beforeId })}` : "";
      const result = await serverGet<BroadcastResult>(`/api/broadcasts${query}`);
      if (!mounted.current) return;
      setBroadcasts((existing) => after
        ? [...new Map([...existing, ...result.broadcasts].map((row) => [row.id, row])).values()]
        : result.broadcasts);
      const merged = after
        ? [...new Map([...broadcastsRef.current, ...result.broadcasts].map((row) => [row.id, row])).values()]
        : result.broadcasts;
      try { localStorage.setItem(`alerts.broadcasts.v1:${scope}`, JSON.stringify(merged)); } catch { /* Announcements remain available online. */ }
      setCursor(result.nextCursor);
      setError(null);
    } catch {
      if (mounted.current) setError("Announcements couldn't be loaded. Connect and try again.");
    } finally {
      busy.current = false;
      if (mounted.current) setLoading(false);
    }
  }, [enabled, scope]);
  useEffect(() => {
    mounted.current = true;
    const refresh = () => { if (document.visibilityState !== "hidden") void fetchFeed(); };
    refresh();
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      mounted.current = false;
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [fetchFeed]);
  return <Context.Provider value={{ broadcasts, loading, error, hasMore: cursor !== null, loadMore: () => { if (cursor) void fetchFeed(cursor); }, retry: () => { void fetchFeed(); } }}>{children}</Context.Provider>;
}

export function useBroadcasts() { return useContext(Context); }

/** One UI: a quiet reminder banner, with an explicit dismiss control. */
export function BroadcastBanner() {
  const user = useCurrentUserOptional();
  const { broadcasts } = useBroadcasts();
  const { readIds, viewedIds, markRead } = useAlertReadState(alertScope(user));
  const unread = broadcasts.filter((row) => {
    const id = `broadcast-${row.id}`;
    return !readIds.has(id) && !viewedIds.has(id);
  });
  const message = unread[0];
  if (!message) return null;
  return (
    <aside aria-label="Announcement" className="flex items-start gap-3 border-b border-border bg-surface-container px-4 py-3">
      <Megaphone size={20} className="mt-1 shrink-0 text-brand-accent" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[length:var(--font-size-label)] font-semibold text-on-surface">Announcement</p>
        <p className="line-clamp-2 break-words text-[length:var(--font-size-body)] text-on-surface-muted">{message.content}</p>
        <RippleLink href="/alerts" className="inline-flex min-h-[var(--touch-target-min)] items-center text-[length:var(--font-size-label)] font-semibold text-brand-accent">View alerts{unread.length > 1 ? ` (${unread.length})` : ""}</RippleLink>
      </div>
      <RippleButton type="button" aria-label="Dismiss announcement" onClick={() => markRead([`broadcast-${message.id}`])} className="flex min-h-[var(--touch-target-min)] min-w-[var(--touch-target-min)] shrink-0 items-center justify-center rounded-full text-on-surface-muted hover:bg-surface-container-high"><X size={20} aria-hidden /></RippleButton>
    </aside>
  );
}
