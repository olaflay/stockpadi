"use client";

import { useState } from "react";
import { callBackend } from "@/features/auth/backend-client";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useToast } from "@/components/ui/Toast";

export default function AdminBroadcastsPage() {
  const { showToast } = useToast();
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  async function publish() {
    if (!content.trim()) return;
    setSaving(true);
    try {
      await callBackend("platform-api", { action: "publish_broadcast", content });
      setContent("");
      showToast("Broadcast published.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not publish broadcast.", "danger");
    } finally { setSaving(false); }
  }

  return <div className="flex flex-col gap-4"><ScreenHeader title="Platform broadcasts" /><p className="text-on-surface-muted">Publish an announcement for active business workspaces.</p><textarea value={content} onChange={(event) => setContent(event.target.value)} rows={5} placeholder="Write an announcement" className="w-full rounded-[var(--radius-control)] border border-border bg-surface p-3 text-on-surface" /><button type="button" disabled={saving || !content.trim()} onClick={publish} className="min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] bg-brand-accent px-5 font-medium text-brand-accent-contrast disabled:opacity-50">{saving ? "Publishing…" : "Publish broadcast"}</button></div>;
}
