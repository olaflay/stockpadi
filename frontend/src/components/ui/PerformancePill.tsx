import type { LucideIcon } from "lucide-react";

export type PerformancePillTone = "success" | "warning" | "danger" | "brand" | "neutral";

const TONE_CLASSES: Record<PerformancePillTone, string> = {
  success: "bg-success-container text-on-success-container border-success/20",
  warning: "bg-warning-container text-on-warning-container border-warning/20",
  danger: "bg-danger-container text-on-danger-container border-danger/20",
  brand: "bg-brand-accent/10 text-brand-accent border-brand-accent/20",
  neutral: "bg-surface-container-high text-on-surface-muted border-border",
};

/**
 * Compact micro-pill variant for dashboard cards.
 * Renders icon + count/label only, no verbose text — saves horizontal width.
 */
export function PerformancePill({
  label,
  tone = "neutral",
  icon: Icon,
  count,
  compact = false,
  className = "",
}: {
  label: string;
  tone?: PerformancePillTone;
  icon?: LucideIcon;
  /** Optional numeric count to show alongside icon in compact mode. */
  count?: number;
  /** Compact mode: icon + count only, no long label text. */
  compact?: boolean;
  className?: string;
}) {
  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${TONE_CLASSES[tone]} ${className}`}
      >
        {Icon && <Icon size={12} className="shrink-0 stroke-[2.5]" aria-hidden />}
        {count !== undefined && <span className="font-number leading-none">{count}</span>}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[length:var(--font-size-caption)] font-semibold tracking-tight transition-colors ${TONE_CLASSES[tone]} ${className}`}
    >
      {Icon && <Icon size={12} className="shrink-0 stroke-[2.5]" aria-hidden />}
      <span className="font-number leading-none">{label}</span>
    </span>
  );
}
