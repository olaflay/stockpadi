// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDraft, loadDraft, saveDraft, clearDraftStorage } from "../use-draft";

describe("useDraft and draft persistence engine", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("stores and restores draft values using saveDraft and loadDraft", () => {
    saveDraft("test-key", { name: "Peak Milk", price: 1200 });
    const loaded = loadDraft("test-key", null);
    expect(loaded).toEqual({ name: "Peak Milk", price: 1200 });
  });

  it("returns fallback value when draft does not exist", () => {
    const loaded = loadDraft("non-existent-key", { default: true });
    expect(loaded).toEqual({ default: true });
  });

  it("clears draft completely with clearDraftStorage", () => {
    saveDraft("test-key", "temporary text");
    clearDraftStorage("test-key");
    const loaded = loadDraft("test-key", "fallback");
    expect(loaded).toBe("fallback");
  });

  it("persists form state across simulated unmount/remount (simulating page reload)", () => {
    const key = "staff-form-draft";

    // 1. Initial render and user typing
    const { result, unmount } = renderHook(() => useDraft(key, "initial"));
    act(() => {
      result.current[1]("typed staff name");
    });
    expect(result.current[0]).toBe("typed staff name");

    // 2. Unmount hook (simulating page reload or app exit)
    unmount();

    // 3. Mount hook again on page reload
    const { result: reloadedResult } = renderHook(() => useDraft(key, "initial"));
    expect(reloadedResult.current[0]).toBe("typed staff name");

    // 4. Submit succeeds -> clear draft
    act(() => {
      reloadedResult.current[2]();
    });
    expect(reloadedResult.current[0]).toBe("initial");
    expect(loadDraft(key, "empty")).toBe("empty");
  });

  it("discards expired drafts older than 48 hours", () => {
    const key = "expired-draft";
    const seventyHoursAgo = Date.now() - 70 * 60 * 60 * 1000;
    localStorage.setItem(key, JSON.stringify({ savedAt: seventyHoursAgo, data: "old text" }));

    const loaded = loadDraft(key, "fallback");
    expect(loaded).toBe("fallback");
  });
});
