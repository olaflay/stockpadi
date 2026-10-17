"use client";

import { createContext, useCallback, useEffect, useState } from "react";

export type ThemePreference = "light" | "dark" | "system";

export const DEFAULT_THEME: ThemePreference = "system";

const STORAGE_KEY = "stockpadi-theme";

/**
 * Design system surfaceContainer tokens matching src/styles/tokens.css:
 * Light: #eff2f3 (--color-surface-container)
 * Dark:  #1c2022 (--color-surface-container)
 * The mobile PWA system chrome / navigation bar binds directly to this token.
 */
export const THEME_CHROME_COLORS = {
  light: "#eff2f3",
  dark: "#1c2022",
} as const;

export const ThemeContext = createContext<{
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
} | null>(null);

export function resolveEffectiveTheme(theme: ThemePreference): "light" | "dark" {
  if (theme === "dark") return "dark";
  if (theme === "light") return "light";
  if (
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

export function syncSystemThemeColor(theme: ThemePreference) {
  if (typeof document === "undefined") return;
  const effective = resolveEffectiveTheme(theme);
  const color = THEME_CHROME_COLORS[effective];

  const metaTags = document.querySelectorAll('meta[name="theme-color"]');
  if (metaTags.length > 0) {
    metaTags.forEach((tag) => tag.setAttribute("content", color));
  } else {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    meta.setAttribute("content", color);
    document.head.appendChild(meta);
  }
}

function applyTheme(theme: ThemePreference) {
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
  syncSystemThemeColor(theme);
}

/**
 * Wraps the app so every screen can read/set the light-dark-system
 * preference from one place. Defaults to "system" (the existing
 * prefers-color-scheme behavior in src/styles/tokens.css) for all new users;
 * "light" and "dark" pin the choice via a data-theme attribute that overrides
 * the OS preference. Persisted to localStorage; the inline script in
 * src/app/layout.tsx applies the stored value before hydration to avoid a
 * flash of the wrong theme.
 */
function readStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY) as ThemePreference | null;
    return stored === "light" || stored === "dark" ? stored : DEFAULT_THEME;
  } catch {
    // Installed browsers can temporarily deny storage while restoring a WebAPK
    // or after storage has been cleared. Theme is an enhancement, not a reason
    // to stop the entire application from rendering.
    return DEFAULT_THEME;
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(readStoredTheme);

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Keep the in-memory preference for this session when persistence is
      // unavailable.
    }
    applyTheme(next);
  }, []);

  useEffect(() => {
    applyTheme(theme);

    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      if (readStoredTheme() === "system") {
        syncSystemThemeColor("system");
      }
    };
    mq.addEventListener?.("change", handleChange);
    return () => {
      mq.removeEventListener?.("change", handleChange);
    };
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}
