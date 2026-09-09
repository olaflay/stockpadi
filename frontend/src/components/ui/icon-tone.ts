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
  brand: "bg-brand-container text-on-brand-container",
  success: "bg-success-container text-on-success-container",
  warning: "bg-warning-container text-on-warning-container",
  danger: "bg-danger-container text-on-danger-container",
  neutral: "bg-surface-container-high text-on-surface-muted",
};
