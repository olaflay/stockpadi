"use client";

import { createContext, useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

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

/**
 * The browser paints the OS system chrome (status bar, Android navigation
 * bar) — the strip BELOW the app's bottom nav — from the FIRST
 * <meta name="theme-color"> whose media query matches the device.
 *
 * A media-free tag always matches, so owning one and keeping it first
 * makes the painted colour deterministic: whatever Next.js writes into
 * <head> on a client-side navigation, the browser still reads this tag.
 */
const CHROME_META_ID = "app-theme-color";

function ensureChromeMeta(): HTMLMetaElement {
  const head = document.head;
  let meta = document.getElementById(CHROME_META_ID) as HTMLMetaElement | null;

  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    meta.setAttribute("id", CHROME_META_ID);
    head.appendChild(meta);
  }

  // Keep it first among the theme-color tags so it always wins the
  // "first matching meta" rule.
  const first = document.querySelector('meta[name="theme-color"]');
  if (first && first !== meta) {
    head.insertBefore(meta, first);
  }

  return meta;
}

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
  const isPinned = theme === "light" || theme === "dark";

  // The OS system chrome (status bar, Android navigation bar) paints the
  // area BELOW the app's bottom nav, and it only ever reads
  // <meta name="theme-color">.
  //
  // A PINNED theme must win over the device, so every tag carries the
  // pinned token: a browser whose OS is in light mode would otherwise
  // select the light-media tag and paint the system nav bar light while the
  // app itself is dark.
  //
  // In "system" mode the media-scoped pair is restored to its own
  // media-appropriate colour, so the device still drives the system chrome
  // and an OS light->dark flip is followed live.
  const chromeMeta = ensureChromeMeta();
  chromeMeta.setAttribute("content", color);

  document.querySelectorAll('meta[name="theme-color"]').forEach((tag) => {
    if (tag === chromeMeta) return;
    const media = tag.getAttribute("media") ?? "";
    if (isPinned) {
      tag.setAttribute("content", color);
    } else if (media.includes("dark")) {
      tag.setAttribute("content", THEME_CHROME_COLORS.dark);
    } else if (media.includes("light")) {
      tag.setAttribute("content", THEME_CHROME_COLORS.light);
    } else {
      tag.setAttribute("content", color);
    }
  });

  // The browser's own canvas, scrollbar and overscroll area follow
  // `color-scheme`. Without this the root stays "normal" (light) in dark
  // mode, which is what leaves a white strip under the nav bar on a device
  // with a home indicator.
  //
  // A PINNED theme sets it inline, because the pinned choice has to win
  // over the device. "system" deliberately leaves it to CSS, whose
  // prefers-color-scheme query keeps following the device live — an inline
  // value would override that query and pin the canvas until the next
  // navigation.
  if (isPinned) {
    document.documentElement.style.colorScheme = effective;
  } else {
    document.documentElement.style.removeProperty("color-scheme");
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
  const pathname = usePathname();

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

  // Next.js re-renders the root layout's <head> on every client-side
  // navigation, which restores the static media-scoped <meta
  // name="theme-color"> pair declared in src/app/layout.tsx. A user who
  // pinned Dark in Settings therefore had the light token painted under the
  // bottom nav bar again the moment they navigated to another screen.
  //
  // Re-syncing on every route change re-applies the pinned token after the
  // head has been rebuilt. The OS-preference media query is also re-read
  // here, so a "system" preference still follows the device.
  useEffect(() => {
    syncSystemThemeColor(theme);
  }, [theme, pathname]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}
