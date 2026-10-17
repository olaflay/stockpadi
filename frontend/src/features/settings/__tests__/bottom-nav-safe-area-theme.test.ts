// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import {
  THEME_CHROME_COLORS,
  resolveEffectiveTheme,
  syncSystemThemeColor,
} from "../ThemeProvider";

describe("Bottom Navigation Safe Area & Dynamic Theme Synchronization", () => {
  let metaTag: HTMLMetaElement;

  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
    // Ensure standard meta theme-color tag exists in test DOM
    metaTag = document.createElement("meta");
    metaTag.setAttribute("name", "theme-color");
    metaTag.setAttribute("content", "#ffffff");
    document.head.appendChild(metaTag);
  });

  afterEach(() => {
    metaTag.remove();
    document.documentElement.removeAttribute("data-theme");
  });

  it("resolves exact surfaceContainer tokens with zero hardcoded mismatch", () => {
    expect(THEME_CHROME_COLORS.light).toBe("#eff2f3");
    expect(THEME_CHROME_COLORS.dark).toBe("#1c2022");
  });

  it("synchronizes <meta name=\"theme-color\"> to dark surface container (#1c2022) when dark mode is active", () => {
    syncSystemThemeColor("dark");
    expect(resolveEffectiveTheme("dark")).toBe("dark");
    expect(metaTag.getAttribute("content")).toBe("#1c2022");
  });

  it("synchronizes <meta name=\"theme-color\"> to light surface container (#eff2f3) when light mode is active", () => {
    syncSystemThemeColor("light");
    expect(resolveEffectiveTheme("light")).toBe("light");
    expect(metaTag.getAttribute("content")).toBe("#eff2f3");
  });

  it("dynamically follows system media queries when theme preference is 'system'", () => {
    // When prefers-color-scheme is light
    window.matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });

    syncSystemThemeColor("system");
    expect(metaTag.getAttribute("content")).toBe("#eff2f3");

    // When prefers-color-scheme is dark
    window.matchMedia = (query: string) => ({
      matches: query.includes("prefers-color-scheme: dark"),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });

    syncSystemThemeColor("system");
    expect(metaTag.getAttribute("content")).toBe("#1c2022");
  });

  it("verifies zero boundary color mismatch between navbar surface container and PWA system chrome in dark mode", () => {
    const navBarBackgroundDark = "#1c2022"; // --color-surface-container in dark mode
    syncSystemThemeColor("dark");
    const pwaSystemChromeColor = metaTag.getAttribute("content");

    expect(pwaSystemChromeColor).toBe(navBarBackgroundDark);
  });

  it("verifies zero boundary color mismatch between navbar surface container and PWA system chrome in light mode", () => {
    const navBarBackgroundLight = "#eff2f3"; // --color-surface-container in light mode
    syncSystemThemeColor("light");
    const pwaSystemChromeColor = metaTag.getAttribute("content");

    expect(pwaSystemChromeColor).toBe(navBarBackgroundLight);
  });

  it("asserts identical bg-surface-container token alignment between BottomNav and layout safe-area chin blankets", () => {
    const layoutPath = path.resolve(__dirname, "../../../app/(app)/layout.tsx");
    const bottomNavPath = path.resolve(__dirname, "../../../components/ui/BottomNav.tsx");

    const layoutContent = fs.readFileSync(layoutPath, "utf-8");
    const bottomNavContent = fs.readFileSync(bottomNavPath, "utf-8");

    // BottomNav must use bg-surface-container
    expect(bottomNavContent).toContain("bg-surface-container");

    // Global safe-area bottom blanket and deep overscroll blanket must use bg-surface-container
    expect(layoutContent).toContain("Global safe-area bottom blanket");
    expect(layoutContent).toContain("Deep overscroll blanket");

    // Must NOT contain bg-surface on the chin blanket
    const chinSection = layoutContent.slice(
      layoutContent.indexOf("Global safe-area bottom blanket"),
      layoutContent.indexOf("<BottomNav />")
    );
    expect(chinSection).toContain("bg-surface-container");
    expect(chinSection).not.toContain("bg-surface ");
    expect(chinSection).not.toContain("bg-surface\"");
  });

  it("asserts manifest.json standalone theme properties align with surfaceContainer chrome color", () => {
    const manifestPath = path.resolve(__dirname, "../../../../public/manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toBe(THEME_CHROME_COLORS.light);
    expect(manifest.background_color).toBe(THEME_CHROME_COLORS.light);
  });
});

