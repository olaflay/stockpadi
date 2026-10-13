// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useKeyboardOpen } from "../use-keyboard-open";

describe("useKeyboardOpen", () => {
  const originalVisualViewport = window.visualViewport;
  const originalInnerWidth = window.innerWidth;
  const originalInnerHeight = window.innerHeight;

  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, "innerWidth", { writable: true, value: 390 });
    Object.defineProperty(window, "innerHeight", { writable: true, value: 844 });
    Object.defineProperty(window, "ontouchstart", { writable: true, value: {} });
    Object.defineProperty(navigator, "maxTouchPoints", { writable: true, value: 5 });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(window, "visualViewport", { writable: true, value: originalVisualViewport });
    Object.defineProperty(window, "innerWidth", { writable: true, value: originalInnerWidth });
    Object.defineProperty(window, "innerHeight", { writable: true, value: originalInnerHeight });
    document.body.innerHTML = "";
  });

  it("defaults to false when no input is focused and viewport is normal", () => {
    const { result } = renderHook(() => useKeyboardOpen());
    expect(result.current).toBe(false);
  });

  it("detects virtual keyboard open when visualViewport height shrinks by > 100px", () => {
    const listeners: Record<string, (() => void)[]> = {};
    const mockVV = {
      height: 500, // Shrunk from 844
      addEventListener: vi.fn((event: string, cb: () => void) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(cb);
      }),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(window, "visualViewport", { writable: true, value: mockVV });

    const { result } = renderHook(() => useKeyboardOpen());
    expect(result.current).toBe(true);

    // Simulate viewport expanding back when keyboard closes
    act(() => {
      mockVV.height = 844;
      listeners["resize"]?.forEach((cb) => cb());
    });
    expect(result.current).toBe(false);
  });

  it("detects virtual keyboard open when a text input is focused on touch mobile", () => {
    const input = document.createElement("input");
    input.type = "number";
    document.body.appendChild(input);

    const { result } = renderHook(() => useKeyboardOpen());
    expect(result.current).toBe(false);

    act(() => {
      input.focus();
      window.dispatchEvent(new Event("focusin"));
    });
    expect(result.current).toBe(true);

    act(() => {
      input.blur();
      window.dispatchEvent(new Event("focusout"));
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe(false);
  });

  it("does not report keyboard open on desktop when an input is focused without viewport shrinkage", () => {
    Object.defineProperty(window, "innerWidth", { writable: true, value: 1440 });
    delete (window as unknown as Record<string, unknown>).ontouchstart;
    Object.defineProperty(navigator, "maxTouchPoints", { writable: true, value: 0 });

    const input = document.createElement("input");
    input.type = "text";
    document.body.appendChild(input);

    const { result } = renderHook(() => useKeyboardOpen());

    act(() => {
      input.focus();
      window.dispatchEvent(new Event("focusin"));
    });
    expect(result.current).toBe(false);
  });
});
