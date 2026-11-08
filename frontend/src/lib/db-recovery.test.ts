// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { PWA_UPDATE_REQUIRED_EVENT } from "@/lib/pwa-update-events";
import { db, recoverDatabaseConnection, withDatabaseClosedRecovery } from "./db";

function closedError(): Error {
  return Object.assign(new Error("database closed"), { name: "DatabaseClosedError" });
}

describe("IndexedDB closed-connection recovery", () => {
  afterEach(() => {
    window.removeEventListener(PWA_UPDATE_REQUIRED_EVENT, onUpdateRequired);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  let updateRequired = false;
  const onUpdateRequired = () => { updateRequired = true; };

  it("reopens IndexedDB and retries the same local operation once", async () => {
    updateRequired = false;
    const operation = vi.fn().mockRejectedValueOnce(closedError()).mockResolvedValue("saved");
    await expect(withDatabaseClosedRecovery(operation)).resolves.toBe("saved");
    expect(operation).toHaveBeenCalledTimes(2);
    expect(updateRequired).toBe(false);
  });

  it("requests the automatic app update if the retried operation is still blocked", async () => {
    updateRequired = false;
    window.addEventListener(PWA_UPDATE_REQUIRED_EVENT, onUpdateRequired);
    const operation = vi.fn().mockRejectedValue(closedError());
    await expect(withDatabaseClosedRecovery(operation)).rejects.toMatchObject({ name: "DatabaseClosedError" });
    expect(operation).toHaveBeenCalledTimes(2);
    expect(updateRequired).toBe(true);
  });

  it("ends a stalled recovery and closes any connection that opens after the timeout", async () => {
    vi.useFakeTimers();
    let resolveOpen!: () => void;
    let opened = false;
    const stalledOpen = new Promise<void>((resolve) => { resolveOpen = resolve; });
    vi.spyOn(db, "open").mockReturnValue(stalledOpen as unknown as ReturnType<typeof db.open>);
    vi.spyOn(db, "isOpen").mockImplementation(() => opened);
    const close = vi.spyOn(db, "close");

    const recovery = recoverDatabaseConnection(50);
    await vi.advanceTimersByTimeAsync(150);
    await expect(recovery).resolves.toBe(false);

    opened = true;
    resolveOpen();
    await Promise.resolve();
    expect(close).toHaveBeenCalled();
  });
});
