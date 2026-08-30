import type { LucideIcon } from "lucide-react";

export type PerformancePillTone = "success" | "warning" | "danger" | "brand" | "neutral";

const TONE_CLASSES: Record<PerformancePillTone, string> = {
  success: "bg-success-container text-on-success-container border-success/20",
  warning: "bg-warning-container text-on-warning-container border-warning/20",
  danger: "bg-danger-container text-on-danger-container border-danger/20",
  brand: "bg-brand-accent/10 text-brand-accent border-brand-accent/20",
  neutral: "bg-surface-container-high text-on-surface-muted border-border",
};

export function PerformancePill({
  label,
  tone = "neutral",
  icon: Icon,
  className = "",
}: {
  label: string;
  tone?: PerformancePillTone;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[length:var(--font-size-caption)] font-semibold tracking-tight transition-colors ${TONE_CLASSES[tone]} ${className}`}
    >
      {Icon && <Icon size={12} className="shrink-0 stroke-[2.5]" aria-hidden />}
      <span className="font-number leading-none">{label}</span>
    </span>
  );
}
