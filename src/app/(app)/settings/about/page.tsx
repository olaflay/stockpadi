"use client";

import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";

/** Open to every role — nothing here is sensitive. */
export default function AboutSettingsPage() {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader title="About" onBack={() => router.push("/settings")} />

      <div className="rounded-[var(--radius-card)] border border-border p-4">
        <p className="text-[length:var(--font-size-body-lg)] text-on-surface">StockPadi</p>
        <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
          Offline-first inventory and point-of-sale.
        </p>
      </div>

      <section className="flex items-start gap-3 rounded-[var(--radius-card)] border border-border bg-surface-container p-4">
        <ShieldCheck size={20} className="mt-0.5 shrink-0 text-on-surface-muted" aria-hidden />
        <p className="text-[length:var(--font-size-caption)] leading-relaxed text-on-surface-muted">
          <b>NDPR Compliance Statement:</b> All sales, inventory, and staff data are stored locally in IndexedDB. No
          information is transmitted to external servers unless synchronizing with a self-hosted cloud instance.
        </p>
      </section>

      <p className="text-center text-[length:var(--font-size-caption)] text-on-surface-muted">
        Questions? Ask an Owner or Admin.
      </p>
    </div>
  );
}
