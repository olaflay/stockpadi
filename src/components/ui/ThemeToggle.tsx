"use client";

import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "@/features/settings/use-theme";
import type { ThemePreference } from "@/features/settings/ThemeProvider";

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/**
 * Three-way segmented control (M3 pattern) for Settings > Appearance.
 * "System" keeps following the OS via prefers-color-scheme in
 * src/styles/tokens.css; "Light"/"Dark" pin the choice with data-theme.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className="flex gap-1 rounded-[var(--radius-control)] bg-surface-container p-1"
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
