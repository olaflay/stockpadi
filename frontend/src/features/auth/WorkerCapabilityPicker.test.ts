import { describe, expect, it } from "vitest";
import { applyCapabilityPreset, WORKER_CAPABILITY_PRESETS } from "./WorkerCapabilityPicker";

describe("worker capability presets", () => {
  const salesPerson = WORKER_CAPABILITY_PRESETS.find((preset) => preset.id === "sales-person");

  it("adds the complete sales-person access bundle", () => {
    expect(salesPerson).toBeDefined();
    expect(applyCapabilityPreset([], salesPerson!, true)).toEqual(salesPerson!.capabilities);
  });

  it("removes only the selected preset capabilities during fine tuning", () => {
    const current = [...salesPerson!.capabilities, "VIEW_ALERTS" as const];
    expect(applyCapabilityPreset(current, salesPerson!, false)).toEqual(["VIEW_ALERTS"]);
  });
});
