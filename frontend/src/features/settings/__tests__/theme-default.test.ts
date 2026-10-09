// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createElement, useContext } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_THEME, ThemeContext, ThemeProvider } from "@/features/settings/ThemeProvider";

function ThemeProbe() {
  const value = useContext(ThemeContext);
  return createElement("span", null, value?.theme);
}

describe("Theme Default for New Users", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("ensures the default theme is strictly 'system'", () => {
    expect(DEFAULT_THEME).toBe("system");
  });

  it("defaults to system theme when localStorage has no pinned preference", () => {
    const stored = window.localStorage.getItem("stockpadi-theme");
    expect(stored).toBeNull();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("still renders when an installed browser denies localStorage reads", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    render(
      createElement(
        ThemeProvider,
        null,
        createElement(ThemeProbe)
      )
    );

    expect(screen.getByText(DEFAULT_THEME)).toBeTruthy();
  });
});
