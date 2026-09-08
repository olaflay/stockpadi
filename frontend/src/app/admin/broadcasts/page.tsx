"use client";

import { useState, useEffect, useCallback } from "react";
import { callBackend } from "@/features/auth/backend-client";
import { useToast } from "@/components/ui/Toast";
import { Skeleton } from "@/components/ui/Skeleton";
import { RippleButton } from "@/components/ui/Ripple";
import {
  Radio,
  Send,
  Sparkles,
  AlertTriangle,
  Info,
  Clock,
  RefreshCw,
  Eye,
  CheckCircle2,
} from "lucide-react";
import { formatShortDate } from "@/lib/format";

interface BroadcastItem {
  id: string;
  scope: string;
  content: string;
  priority: number;
  status: string;
  created_at: string;
  created_by?: string;
}

export default function AdminBroadcastsPage() {
  const { showToast } = useToast();
  const [content, setContent] = useState("");
  const [priority, setPriority] = useState<number>(0);
  const [publishing, setPublishing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [broadcasts, setBroadcasts] = useState<BroadcastItem[]>([]);

  const fetchBroadcasts = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await callBackend<{ broadcasts: BroadcastItem[] }>("platform-api", {
        action: "list_broadcasts",
      });
      setBroadcasts(res.broadcasts || []);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to load broadcast history.", "danger");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchBroadcasts();
  }, [fetchBroadcasts]);

  async function handlePublish() {
    const trimmed = content.trim();
    if (!trimmed) {
      showToast("Broadcast message cannot be empty.", "warning");
      return;
    }

    setPublishing(true);
    try {
      await callBackend("platform-api", {
        action: "publish_broadcast",
        content: trimmed,
      });

      setContent("");
      showToast("Platform broadcast published to all tenant stores.", "success");
      fetchBroadcasts(true);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Failed to publish broadcast.",
        "danger"
      );
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-on-surface">
            Platform Broadcasts
          </h1>
          <p className="text-xs sm:text-sm text-on-surface-muted mt-0.5">
            Deliver immediate platform-wide announcements, maintenance notices, and news to all merchants.
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchBroadcasts(true)}
          disabled={refreshing}
          className="inline-flex items-center self-start sm:self-auto gap-2 rounded-lg border border-border/80 bg-surface-container-low px-3.5 py-2 text-xs font-semibold text-on-surface hover:bg-surface-container transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
        >
          <RefreshCw size={13} className={refreshing ? "animate-spin text-brand-accent" : ""} />
          <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
        </button>
      </div>

      {/* Grid: Composer (Left) & Live Preview (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Composer Card */}
        <div className="lg:col-span-7 flex flex-col justify-between rounded-2xl border border-border/80 bg-surface-container-low p-5 sm:p-6 shadow-xs">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                <Radio size={18} className="text-brand-accent" />
                <span className="text-sm font-bold text-on-surface">New Announcement</span>
              </div>
              <span className="rounded-full bg-brand-accent/10 px-2 py-0.5 text-[11px] font-semibold text-brand-accent">
                Target: All Tenants
              </span>
            </div>

            {/* Message Input */}
            <div className="mt-4 flex flex-col gap-2">
              <label htmlFor="broadcast-content" className="text-xs font-semibold text-on-surface">
                Announcement Message
              </label>
              <textarea
                id="broadcast-content"
                value={content}
                onChange={(e) => setContent(e.target.value.slice(0, 500))}
                rows={4}
                placeholder="Type your platform announcement here (e.g. Scheduled maintenance tonight at 2:00 AM UTC)…"
                className="w-full rounded-xl border border-border bg-surface p-3.5 text-xs sm:text-sm text-on-surface placeholder:text-on-surface-muted/60 focus:border-brand-accent focus:outline-none focus:ring-1 focus:ring-brand-accent transition-all resize-none"
              />
              <div className="flex justify-between items-center text-[11px] text-on-surface-muted">
                <span>Direct delivery to active merchant sessions.</span>
                <span className={content.length >= 480 ? "text-danger font-semibold" : ""}>
                  {content.length} / 500
                </span>
              </div>
            </div>

            {/* Priority Selector */}
            <div className="mt-4 flex flex-col gap-2">
              <span className="text-xs font-semibold text-on-surface">Priority Level</span>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setPriority(0)}
                  className={`flex items-center gap-2 rounded-xl border p-2.5 text-xs font-semibold transition-all cursor-pointer ${
                    priority === 0
                      ? "border-brand-accent bg-brand-accent/10 text-brand-accent"
                      : "border-border bg-surface text-on-surface-muted hover:text-on-surface"
                  }`}
                >
                  <Info size={16} />
                  <div className="text-left">
                    <p className="font-bold">Standard</p>
                    <p className="text-[10px] opacity-70 font-normal">Informational banner</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPriority(1)}
                  className={`flex items-center gap-2 rounded-xl border p-2.5 text-xs font-semibold transition-all cursor-pointer ${
                    priority === 1
                      ? "border-warning bg-warning/10 text-warning"
                      : "border-border bg-surface text-on-surface-muted hover:text-on-surface"
                  }`}
                >
                  <AlertTriangle size={16} />
                  <div className="text-left">
                    <p className="font-bold">Urgent / Alert</p>
                    <p className="text-[10px] opacity-70 font-normal">Highlighted notice</p>
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div className="mt-6 pt-4 border-t border-border/60 flex items-center justify-end gap-3">
            {content.trim() && (
              <button
                type="button"
                onClick={() => setContent("")}
                className="text-xs font-semibold text-on-surface-muted hover:text-on-surface cursor-pointer"
              >
                Clear
              </button>
            )}

            <RippleButton
              type="button"
              disabled={publishing || !content.trim()}
              onClick={handlePublish}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-accent px-5 py-2.5 text-xs sm:text-sm font-semibold text-brand-accent-contrast shadow-sm hover:opacity-95 active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
            >
              <Send size={14} />
              <span>{publishing ? "Publishing…" : "Publish Announcement"}</span>
            </RippleButton>
          </div>
        </div>

        {/* Live Preview Card */}
        <div className="lg:col-span-5 flex flex-col rounded-2xl border border-border/80 bg-surface-container-low p-5 sm:p-6 shadow-xs">
          <div className="flex items-center gap-2 pb-3 border-b border-border/60 text-xs font-bold text-on-surface uppercase tracking-wider">
            <Eye size={15} className="text-brand-accent" />
            <span>Live Merchant Preview</span>
          </div>

          <div className="mt-4 flex-1 flex flex-col justify-center">
            <p className="text-xs text-on-surface-muted mb-2">
              Preview of how this alert renders on the store cashier & manager dashboard:
            </p>

            <div
              className={`rounded-xl border p-4 shadow-sm transition-all ${
                priority === 1
                  ? "border-warning/50 bg-warning/10 text-warning"
                  : "border-brand-accent/40 bg-brand-accent/10 text-brand-accent"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  {priority === 1 ? <AlertTriangle size={18} /> : <Sparkles size={18} />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider">
                      StockPadi Announcement
                    </span>
                    <span className="text-[10px] opacity-70">Just now</span>
                  </div>
                  <p className="mt-1 text-xs text-on-surface leading-relaxed">
                    {content.trim() || "Your broadcast announcement text will appear here in real time."}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-lg bg-surface-container p-3 text-[11px] text-on-surface-muted flex items-center gap-2">
            <CheckCircle2 size={13} className="text-success shrink-0" />
            <span>Online-only push. Does not affect offline sales operations.</span>
          </div>
        </div>
      </div>

      {/* Past Broadcast History */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-on-surface">Broadcast Log</h2>
          <span className="text-xs text-on-surface-muted">{broadcasts.length} past announcement(s)</span>
        </div>

        {loading ? (
          <div className="flex flex-col gap-2.5">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        ) : broadcasts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-surface-container-low/40 py-10 px-4 text-center">
            <Radio size={32} className="text-on-surface-muted opacity-40 mb-2" />
            <p className="text-sm font-semibold text-on-surface">No platform broadcasts sent yet</p>
            <p className="text-xs text-on-surface-muted mt-0.5">
              Compose your first announcement using the composer above.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {broadcasts.map((item) => (
              <div
                key={item.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border/80 bg-surface-container-low p-4 shadow-xs hover:border-brand-accent/30 transition-all"
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-accent/10 text-brand-accent">
                    <Radio size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-medium text-on-surface leading-snug break-words">
                      {item.content}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-on-surface-muted">
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        <span>{formatShortDate(item.created_at.split("T")[0])}</span>
                      </span>
                      <span>•</span>
                      <span className="capitalize">Status: {item.status}</span>
                      <span>•</span>
                      <span className="font-mono text-[10px]">ID: {item.id.slice(0, 8)}</span>
                    </div>
                  </div>
                </div>

                <div className="self-end sm:self-center shrink-0">
                  <span className="rounded-md bg-surface-container px-2.5 py-1 text-[11px] font-semibold text-on-surface-muted">
                    Published
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
