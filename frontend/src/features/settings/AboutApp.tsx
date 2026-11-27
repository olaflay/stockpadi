import { ShieldCheck } from "lucide-react";
import { getBrandingConfig } from "@/config/branding";

export function AboutApp() {
  const { businessName } = getBrandingConfig();
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl bg-surface-container p-4">
        <p className="text-[length:var(--font-size-body-lg)] font-semibold text-on-surface">{businessName}</p>
        <p className="mt-1 text-sm text-on-surface-muted">Offline-first inventory and point of sale.</p>
      </div>
      <section className="flex items-start gap-3 rounded-2xl bg-surface-container p-4">
        <ShieldCheck size={20} className="mt-0.5 shrink-0 text-brand-accent-active" aria-hidden />
        <p className="text-sm text-on-surface-muted">Supported workflows save records on this device. When you reconnect, the app can upload changes to your business account.</p>
      </section>
    </div>
  );
}
