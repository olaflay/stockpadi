import { describe, expect, it } from "vitest";
import { WORKER_CAPABILITIES } from "../../shared/contracts.generated.js";
import { parseWorkerRequest } from "./worker.schema.js";
import { isWorkerRetentionExpired } from "./worker.repository.js";

describe("worker request capabilities", () => {
  it("accepts every capability exposed by the shared contract", () => {
    const request = parseWorkerRequest({
      action: "update_permissions",
      userId: "worker-id",
      capabilities: [...WORKER_CAPABILITIES],
    });

    expect(request.capabilities).toEqual([...WORKER_CAPABILITIES]);
  });

  it("rejects values that are not canonical capabilities", () => {
    expect(() => parseWorkerRequest({
      action: "update_permissions",
      userId: "worker-id",
      capabilities: ["view products"],
    })).toThrow("capabilities must contain supported permissions");
  });

  it("keeps deactivated workers reactivatable through day 30 only", () => {
    const now = Date.parse("2026-09-20T00:00:00.000Z");
    expect(isWorkerRetentionExpired("2026-08-22T00:00:00.000Z", now)).toBe(false);
    expect(isWorkerRetentionExpired("2026-08-21T00:00:00.000Z", now)).toBe(true);
  });
});
