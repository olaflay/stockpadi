import type { LucideIcon } from "lucide-react";

export type PerformancePillTone = "success" | "warning" | "danger" | "brand" | "neutral";

const TONE_CLASSES: Record<PerformancePillTone, string> = {
  success: "bg-success-container text-on-success-container",
  warning: "bg-warning-container text-on-warning-container",
  danger: "bg-danger-container text-on-danger-container",
  brand: "bg-brand-accent/10 text-brand-accent",
  neutral: "bg-surface-container-high text-on-surface-muted",
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
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${TONE_CLASSES[tone]} ${className}`}
      >
        {Icon && <Icon size={12} className="shrink-0 stroke-[2.5]" aria-hidden />}
        {count !== undefined && <span className="font-number leading-none">{count}</span>}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[length:var(--font-size-caption)] font-semibold tracking-tight transition-colors ${TONE_CLASSES[tone]} ${className}`}
    >
      {Icon && <Icon size={12} className="shrink-0 stroke-[2.5]" aria-hidden />}
      <span className="font-number leading-none">{label}</span>
    </span>
  );
}
