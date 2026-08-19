"use client";

import { createContext, useCallback, useState } from "react";

export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "stockpadi-theme";

export const ThemeContext = createContext<{
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
} | null>(null);

function applyTheme(theme: ThemePreference) {
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
}

/**
 * Wraps the app so every screen can read/set the light-dark-system
 * preference from one place. Defaults to "system" (the existing
 * prefers-color-scheme behavior in src/styles/tokens.css); "light" and
 * "dark" pin the choice via a data-theme attribute that overrides the OS
 * preference. Persisted to localStorage; the inline script in
 * src/app/layout.tsx applies the stored value before hydration to avoid a
 * flash of the wrong theme.
 */
function readStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(STORAGE_KEY) as ThemePreference | null;
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(readStoredTheme);

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}
