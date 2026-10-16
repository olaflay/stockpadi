// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { hideSplash, _resetHidingForTesting } from "../splash";

describe("hideSplash", () => {
  beforeEach(() => {
    _resetHidingForTesting();
    document.body.innerHTML = "";
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("resolves immediately if #splash element is not present", async () => {
    const promise = hideSplash();
    await expect(promise).resolves.toBeUndefined();
  });

  it("waits for full animation and removes #splash element", async () => {
    const splash = document.createElement("div");
    splash.id = "splash";
    document.body.appendChild(splash);

    vi.spyOn(performance, "now").mockReturnValue(0);

    const promise = hideSplash();

    // At 1000ms, splash should still be visible and not yet leaving
    vi.advanceTimersByTime(1000);
    expect(splash.classList.contains("is-leaving")).toBe(false);
    expect(document.getElementById("splash")).not.toBeNull();

    // At 1850ms, is-leaving class is added
    vi.advanceTimersByTime(850);
    expect(splash.classList.contains("is-leaving")).toBe(true);

    // Simulate transitionend event
    splash.dispatchEvent(new Event("transitionend"));

    await promise;
    expect(document.getElementById("splash")).toBeNull();
  });

  it("credits elapsed navigation time against minimum display time", async () => {
    const splash = document.createElement("div");
    splash.id = "splash";
    document.body.appendChild(splash);

    // Suppose app load took 1500ms
    vi.spyOn(performance, "now").mockReturnValue(1500);

    const promise = hideSplash();

    // Remaining wait should be 1850 - 1500 = 350ms
    vi.advanceTimersByTime(349);
    expect(splash.classList.contains("is-leaving")).toBe(false);

    vi.advanceTimersByTime(1);
    expect(splash.classList.contains("is-leaving")).toBe(true);

    // If transitionend doesn't fire, fallback timeout (500ms) removes it
    vi.advanceTimersByTime(500);
    await promise;
    expect(document.getElementById("splash")).toBeNull();
  });

  it("respects prefers-reduced-motion media query with shorter duration", async () => {
    const splash = document.createElement("div");
    splash.id = "splash";
    document.body.appendChild(splash);

    vi.spyOn(performance, "now").mockReturnValue(0);
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion: reduce"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const promise = hideSplash();

    // With reduced motion, minVisible is 300ms
    vi.advanceTimersByTime(299);
    expect(splash.classList.contains("is-leaving")).toBe(false);

    vi.advanceTimersByTime(1);
    expect(splash.classList.contains("is-leaving")).toBe(true);

    splash.dispatchEvent(new Event("transitionend"));
    await promise;
    expect(document.getElementById("splash")).toBeNull();
  });

  it("is idempotent when called concurrently", () => {
    const splash = document.createElement("div");
    splash.id = "splash";
    document.body.appendChild(splash);

    const p1 = hideSplash();
    const p2 = hideSplash();
    expect(p1).toBe(p2);
  });
});
