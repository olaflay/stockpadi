// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { PWA_UPDATE_REQUIRED_EVENT } from "@/lib/pwa-update-events";
import { withDatabaseClosedRecovery } from "./db";

function closedError(): Error {
  return Object.assign(new Error("database closed"), { name: "DatabaseClosedError" });
}

describe("IndexedDB closed-connection recovery", () => {
  afterEach(() => window.removeEventListener(PWA_UPDATE_REQUIRED_EVENT, onUpdateRequired));

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
});
