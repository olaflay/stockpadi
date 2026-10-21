// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, useContext, useEffect, useState } from "react";
import { render, cleanup, waitFor, act } from "@testing-library/react";
import {
  ThemeContext,
  ThemeProvider,
  resolveEffectiveTheme,
  syncSystemThemeColor,
} from "@/features/settings/ThemeProvider";

// Next.js drives usePathname through a context that re-renders subscribers
// when the route changes. The mock below reproduces that so a client-side
// navigation is a real re-render here, not just a changed return value.
const mockState = vi.hoisted(() => ({
  pathname: "/dashboard",
  listeners: new Set<() => void>(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => {
    const [, forceRender] = useState(0);
    useEffect(() => {
      const listener = () => forceRender((n) => n + 1);
      mockState.listeners.add(listener);
      return () => {
        mockState.listeners.delete(listener);
      };
    }, []);
    return mockState.pathname;
  },
}));

function setPathname(next: string) {
  mockState.pathname = next;
  mockState.listeners.forEach((listener) => listener());
}

/**
 * The OS system chrome (status bar, Android navigation bar) paints the strip
 * BELOW the app's bottom nav bar. It is driven entirely by
 * <meta name="theme-color"> — never by the app's own CSS tokens. If that
 * meta carries the wrong colour, the user sees a light band under a dark
 * nav bar, which is exactly the "safe area stays white in dark mode"
 * defect this suite locks down.
 */
describe("System chrome theme-color binding", () => {
  const CHROME_LIGHT = "#eff2f3";
  const CHROME_DARK = "#1c2022";

  function readMetas(): { media: string; content: string }[] {
    return [...document.querySelectorAll('meta[name="theme-color"]')].map((tag) => ({
      media: tag.getAttribute("media") ?? "",
      content: tag.getAttribute("content") ?? "",
    }));
  }

  /** The media-free tag the browser always reads first, so it wins. */
  function readChromeMeta(): string | null {
    return document.getElementById("app-theme-color")?.getAttribute("content") ?? null;
  }

  function seedMediaPair() {
    const lightMeta = document.createElement("meta");
    lightMeta.setAttribute("name", "theme-color");
    lightMeta.setAttribute("media", "(prefers-color-scheme: light)");
    lightMeta.setAttribute("content", CHROME_LIGHT);
    document.head.appendChild(lightMeta);

    const darkMeta = document.createElement("meta");
    darkMeta.setAttribute("name", "theme-color");
    darkMeta.setAttribute("media", "(prefers-color-scheme: dark)");
    darkMeta.setAttribute("content", CHROME_DARK);
    document.head.appendChild(darkMeta);

    return { lightMeta, darkMeta };
  }

  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.colorScheme = "";
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((tag) => tag.remove());
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.colorScheme = "";
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((tag) => tag.remove());
  });

  it("paints a PINNED dark theme into every theme-color tag, including the light-media one", () => {
    // A device whose OS is in light mode selects the light-media tag, so
    // that tag must carry the pinned Dark token too.
    seedMediaPair();

    syncSystemThemeColor("dark");

    for (const meta of readMetas()) {
      expect(meta.content).toBe(CHROME_DARK);
    }
    expect(readChromeMeta()).toBe(CHROME_DARK);
  });

  it("keeps the media-free chrome tag FIRST so the browser always reads the pinned colour", () => {
    seedMediaPair();
    syncSystemThemeColor("dark");

    const tags = [...document.querySelectorAll('meta[name="theme-color"]')];
    expect(tags[0].getAttribute("id")).toBe("app-theme-color");
    expect(tags[0].getAttribute("media")).toBeNull();
  });

  it("restores the media-appropriate colours in 'system' mode so the device still drives the chrome", () => {
    seedMediaPair();

    syncSystemThemeColor("system");

    const byMedia = Object.fromEntries(readMetas().map((m) => [m.media, m.content]));
    expect(byMedia["(prefers-color-scheme: light)"]).toBe(CHROME_LIGHT);
    expect(byMedia["(prefers-color-scheme: dark)"]).toBe(CHROME_DARK);
  });

  it("declares color-scheme on the root so the browser canvas is not light in dark mode", () => {
    syncSystemThemeColor("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");

    syncSystemThemeColor("light");
    expect(document.documentElement.style.colorScheme).toBe("light");

    // "system" hands the canvas back to CSS, whose prefers-color-scheme
    // query keeps following the device.
    syncSystemThemeColor("system");
    expect(document.documentElement.style.colorScheme).toBe("");
  });

  it("re-applies the pinned token after a client-side navigation rebuilds the head", async () => {
    const { lightMeta, darkMeta } = seedMediaPair();

    let setTheme: (theme: "light" | "dark" | "system") => void = () => {};
    function Probe() {
      const ctx = useContext(ThemeContext);
      if (ctx) setTheme = ctx.setTheme;
      return createElement("span", null, ctx?.theme);
    }

    render(createElement(ThemeProvider, null, createElement(Probe)));
    await act(async () => {
      setTheme("dark");
    });

    // Let React flush the state update and the provider's effects.
    await waitFor(() => {
      expect(lightMeta.getAttribute("content")).toBe(CHROME_DARK);
      expect(readChromeMeta()).toBe(CHROME_DARK);
    });

    // Simulate Next.js rebuilding <head> with the static pair on navigation.
    lightMeta.setAttribute("content", CHROME_LIGHT);
    darkMeta.setAttribute("content", CHROME_DARK);
    expect(lightMeta.getAttribute("content")).toBe(CHROME_LIGHT);

    // A client-side navigation changes the route, which re-runs the
    // provider's sync effect and repairs the rebuilt head.
    await act(async () => {
      setPathname("/products");
    });
    await waitFor(() => {
      expect(lightMeta.getAttribute("content")).toBe(CHROME_DARK);
      expect(readChromeMeta()).toBe(CHROME_DARK);
    });

    for (const meta of readMetas()) {
      expect(meta.content).toBe(CHROME_DARK);
    }
  });

  it("resolves the effective theme from the OS preference when set to 'system'", () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes("prefers-color-scheme: dark"),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;

    expect(resolveEffectiveTheme("system")).toBe("dark");

    window.matchMedia = original;
  });
});
