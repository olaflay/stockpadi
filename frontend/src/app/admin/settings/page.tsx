import Link from "next/link";
import { ScreenHeader } from "@/components/ui/ScreenHeader";

export default function AdminSettingsPage() {
  return <div className="flex flex-col gap-4"><ScreenHeader title="Platform settings" /><section className="rounded-[var(--radius-card)] border border-border bg-surface-container p-5"><h2 className="font-semibold text-on-surface">Platform controls</h2><p className="mt-2 text-on-surface-muted">Platform settings are online-only and protected by platform-admin authorization.</p></section><Link href="/admin" className="text-brand-accent">← Back to admin dashboard</Link></div>;
}
