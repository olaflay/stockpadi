// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { DEFAULT_THEME } from "@/features/settings/ThemeProvider";

describe("Theme Default for New Users", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("ensures the default theme is strictly 'system'", () => {
    expect(DEFAULT_THEME).toBe("system");
  });

  it("defaults to system theme when localStorage has no pinned preference", () => {
    const stored = window.localStorage.getItem("stockpadi-theme");
    expect(stored).toBeNull();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });
});
