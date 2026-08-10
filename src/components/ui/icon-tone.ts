export type IconTone = "brand" | "success" | "warning" | "danger" | "neutral";

/**
 * Semantic icon-circle treatment shared by SettingsRow, Reports, and
 * similar list rows. Each tone maps to a real meaning, never assigned for
 * variety alone: brand = identity, success = positive/protected, warning =
 * needs attention, danger = destructive, neutral = purely structural, no
 * risk or identity meaning attached. BottomNav is intentionally excluded —
 * its active/inactive state is a selection signal, not a category label.
 */
export const ICON_TONE_CLASSES: Record<IconTone, string> = {
  brand: "bg-brand-accent/10 text-brand-accent",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
  neutral: "bg-surface-container-high text-on-surface-muted",
};
