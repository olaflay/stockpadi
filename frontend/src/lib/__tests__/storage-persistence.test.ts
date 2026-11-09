// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  attemptEmergencyCacheEviction,
  ensureStoragePersistence,
  handleStorageQuotaFailure,
  isQuotaExceededError,

} from "../storage-persistence";
import { PWA_STORAGE_QUOTA_EXCEEDED_EVENT } from "../pwa-update-events";

describe("storage-persistence", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("ensureStoragePersistence", () => {
    it("returns persisted: false when navigator.storage is undefined", async () => {
      Object.defineProperty(navigator, "storage", { configurable: true, value: undefined });
      const status = await ensureStoragePersistence();
      expect(status.persisted).toBe(false);
    });

    it("queries persisted() and requests persist() if not already granted", async () => {
      const persistedMock = vi.fn().mockResolvedValue(false);
      const persistMock = vi.fn().mockResolvedValue(true);
      const estimateMock = vi.fn().mockResolvedValue({ quota: 100_000_000, usage: 20_000_000 });

      Object.defineProperty(navigator, "storage", {
        configurable: true,
        value: {
          persisted: persistedMock,
          persist: persistMock,
          estimate: estimateMock,
        },
      });

      const status = await ensureStoragePersistence();
      expect(persistedMock).toHaveBeenCalledOnce();
      expect(persistMock).toHaveBeenCalledOnce();
      expect(estimateMock).toHaveBeenCalledOnce();
      expect(status.persisted).toBe(true);
      expect(status.quotaBytes).toBe(100_000_000);
      expect(status.usageBytes).toBe(20_000_000);
      expect(status.remainingBytes).toBe(80_000_000);
    });

    it("does not call persist() if persisted() already returns true", async () => {
      const persistedMock = vi.fn().mockResolvedValue(true);
      const persistMock = vi.fn().mockResolvedValue(true);

      Object.defineProperty(navigator, "storage", {
        configurable: true,
        value: {
          persisted: persistedMock,
          persist: persistMock,
        },
      });

      const status = await ensureStoragePersistence();
      expect(persistedMock).toHaveBeenCalledOnce();
      expect(persistMock).not.toHaveBeenCalled();
      expect(status.persisted).toBe(true);
    });
  });

  describe("isQuotaExceededError", () => {
    it("detects DOMException QuotaExceededError by name", () => {
      const domError = new DOMException("The quota has been exceeded", "QuotaExceededError");
      expect(isQuotaExceededError(domError)).toBe(true);
    });

    it("detects legacy DOMException code 22", () => {
      const errorWithCode = { name: "CustomError", code: 22 };
      expect(isQuotaExceededError(errorWithCode)).toBe(true);
    });

    it("detects nested inner and cause QuotaExceededError from Dexie", () => {
      const innerQuotaError = new DOMException("Quota exceeded", "QuotaExceededError");
      const dexieError = { name: "DexieError", inner: innerQuotaError };
      expect(isQuotaExceededError(dexieError)).toBe(true);

      const causeError = { name: "StandardError", cause: innerQuotaError };
      expect(isQuotaExceededError(causeError)).toBe(true);
    });

    it("returns false for regular errors", () => {
      expect(isQuotaExceededError(new Error("Network failed"))).toBe(false);
      expect(isQuotaExceededError(null)).toBe(false);
      expect(isQuotaExceededError(undefined)).toBe(false);
      expect(isQuotaExceededError("string error")).toBe(false);
    });
  });

  describe("attemptEmergencyCacheEviction", () => {
    it("deletes only obsolete app-owned runtime caches", async () => {
      const deleteMock = vi.fn().mockResolvedValue(true);
      vi.stubEnv("NEXT_PUBLIC_BUILD_VERSION", "current");
      const keysMock = vi.fn().mockResolvedValue([
        "stockpadi-static-old",
        "stockpadi-navigation-old",
        "stockpadi-static-current",
        "stockpadi-navigation-current",
        "stockpadi-current-precache-v2-https://example.test/",
        "third-party-image-cache",
      ]);

      vi.stubGlobal("caches", {
        keys: keysMock,
        delete: deleteMock,
      });

      const freed = await attemptEmergencyCacheEviction();
      expect(freed).toBe(true);
      expect(deleteMock).toHaveBeenCalledWith("stockpadi-navigation-old");
      expect(deleteMock).toHaveBeenCalledWith("stockpadi-static-old");
      expect(deleteMock).not.toHaveBeenCalledWith("stockpadi-navigation-current");
      expect(deleteMock).not.toHaveBeenCalledWith("stockpadi-static-current");
      expect(deleteMock).not.toHaveBeenCalledWith("stockpadi-current-precache-v2-https://example.test/");
      expect(deleteMock).not.toHaveBeenCalledWith("third-party-image-cache");
    });
  });

  describe("handleStorageQuotaFailure", () => {
    it("dispatches PWA_STORAGE_QUOTA_EXCEEDED_EVENT", async () => {
      const listener = vi.fn();
      window.addEventListener(PWA_STORAGE_QUOTA_EXCEEDED_EVENT, listener);

      await handleStorageQuotaFailure(new DOMException("QuotaExceededError", "QuotaExceededError"));
      expect(listener).toHaveBeenCalledOnce();

      window.removeEventListener(PWA_STORAGE_QUOTA_EXCEEDED_EVENT, listener);
    });
  });
});
