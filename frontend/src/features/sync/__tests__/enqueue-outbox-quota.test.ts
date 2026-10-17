// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { enqueueOutboxWrite } from "../enqueue-outbox-write";
import { setLocalBusinessId, clearLocalBusinessId } from "@/lib/local-tenant";
import { StorageQuotaExceededError } from "@/lib/storage-persistence";
import { PWA_STORAGE_QUOTA_EXCEEDED_EVENT } from "@/lib/pwa-update-events";

describe("enqueueOutboxWrite QuotaExceededError boundary", () => {
  beforeEach(async () => {
    clearLocalBusinessId();
    await setLocalBusinessId("test-biz");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("catches QuotaExceededError, notifies event bus, and throws typed StorageQuotaExceededError", async () => {
    const quotaError = new DOMException("The quota has been exceeded.", "QuotaExceededError");
    vi.spyOn(db.outbox, "put").mockRejectedValueOnce(quotaError);

    const listener = vi.fn();
    window.addEventListener(PWA_STORAGE_QUOTA_EXCEEDED_EVENT, listener);

    await expect(
      enqueueOutboxWrite(
        "test-client-id",
        "stock_adjustment",
        { id: "mov-1", productId: "p-1", quantityDelta: -1 },
        new Date().toISOString()
      )
    ).rejects.toThrow(StorageQuotaExceededError);

    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(PWA_STORAGE_QUOTA_EXCEEDED_EVENT, listener);
  });

  it("propagates other non-quota errors untouched", async () => {
    const genericError = new Error("Database transaction aborted");
    vi.spyOn(db.outbox, "put").mockRejectedValueOnce(genericError);

    await expect(
      enqueueOutboxWrite(
        "test-client-id-2",
        "stock_adjustment",
        { id: "mov-2", productId: "p-1", quantityDelta: -1 },
        new Date().toISOString()
      )
    ).rejects.toThrow("Database transaction aborted");
  });
});
