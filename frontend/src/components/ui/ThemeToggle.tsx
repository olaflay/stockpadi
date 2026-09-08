"use client";

import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "@/features/settings/use-theme";
import type { ThemePreference } from "@/features/settings/ThemeProvider";

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

interface ThemeToggleProps {
  variant?: "segmented" | "pill-icons" | "capsule-pill";
  className?: string;
}

/**
 * Three-way appearance control:
 * - "capsule-pill": Long pill button where only the selected item displays an icon + label,
 *                   while unselected items display text only (like modern photo app nav pill).
 * - "pill-icons": Compact pill-shaped control with icons only (used in SideDrawer footer).
 * - "segmented": Full-size segmented control with icons and text labels.
 */
export function ThemeToggle({ variant = "capsule-pill", className = "" }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();

  if (variant === "pill-icons") {
    return (
      <div
        role="radiogroup"
        aria-label="Appearance"
        className={`inline-flex items-center gap-0.5 rounded-full bg-surface-container p-1 ${className}`}
      >
        {OPTIONS.map(({ value, label, icon: Icon }) => {
          const selected = theme === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${label} theme`}
              title={`${label} theme`}
              onClick={() => setTheme(value)}
              className={`flex h-7 w-7 items-center justify-center rounded-full transition-all ${
                selected
                  ? "bg-surface text-brand-accent shadow-xs scale-105"
                  : "text-on-surface-muted hover:text-on-surface hover:bg-surface-container-high/60"
              }`}
            >
              <Icon size={15} aria-hidden />
            </button>
          );
        })}
      </div>
    );
  }

  if (variant === "capsule-pill") {
    return (
      <div
        role="radiogroup"
        aria-label="Appearance"
        className={`inline-flex items-center rounded-full bg-surface-container-high/90 p-1 border border-border/50 shadow-xs ${className}`}
      >
        {OPTIONS.map(({ value, label, icon: Icon }) => {
          const selected = theme === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${label} theme`}
              onClick={() => setTheme(value)}
              className={`relative flex items-center justify-center rounded-full transition-all duration-200 ${
                selected
                  ? "bg-surface text-on-surface shadow-xs px-3.5 py-1.5 gap-1.5 font-semibold text-xs sm:text-sm"
                  : "text-on-surface-muted hover:text-on-surface px-3 py-1.5 font-medium text-xs sm:text-sm"
              }`}
            >
              {selected && <Icon size={14} className="text-brand-accent shrink-0" aria-hidden />}
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className={`flex gap-1 rounded-[var(--radius-control)] bg-surface-container p-1 ${className}`}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const selected = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(value)}
            className={`flex min-h-[var(--touch-target-min)] flex-1 flex-col items-center justify-center gap-1 rounded-[var(--radius-inline)] px-2 py-2 text-[length:var(--font-size-caption)] transition-colors ${
              selected
                ? "bg-surface text-brand-accent font-[var(--font-weight-emphasis)] shadow-[var(--shadow-elevation-1)]"
                : "text-on-surface-muted"
            }`}
          >
            <Icon size={18} aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}
