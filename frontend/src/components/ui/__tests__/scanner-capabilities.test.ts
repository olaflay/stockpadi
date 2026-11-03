import { describe, expect, it } from "vitest";
import { resolveScannerProfile, scannerVideoConstraints } from "@/components/ui/scanner-capabilities";

describe("scanner capability profiles", () => {
  it("reduces camera and decode workload on low-memory or low-core devices", () => {
    const low = resolveScannerProfile({ deviceMemory: 2, hardwareConcurrency: 4 });
    const capable = resolveScannerProfile({ deviceMemory: 8, hardwareConcurrency: 8 });

    expect(low.tier).toBe("low");
    expect(low.width).toBeLessThan(capable.width);
    expect(low.frameRate).toBeLessThan(capable.frameRate);
    expect(low.decodeIntervalMs).toBeGreaterThan(capable.decodeIntervalMs);
  });

  it("uses a conservative balanced profile when capability signals are unavailable", () => {
    expect(resolveScannerProfile({}).tier).toBe("balanced");
  });

  it("uses ideal rather than exact constraints so weak cameras can negotiate a supported mode", () => {
    const constraints = scannerVideoConstraints(resolveScannerProfile({ deviceMemory: 2 }));

    expect(constraints.width).toEqual({ ideal: 640 });
    expect(constraints.height).toEqual({ ideal: 480 });
    expect(constraints.frameRate).toEqual({ ideal: 15, max: 15 });
  });
});
