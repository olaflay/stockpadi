import { describe, expect, it, vi } from "vitest";
import { openStartupDestination } from "./startup-route";

describe("offline startup navigation", () => {
  it("uses a service-worker document navigation instead of a hanging RSC redirect", () => {
    const clientReplace = vi.fn();
    const documentReplace = vi.fn();

    openStartupDestination("/dashboard", clientReplace, true, documentReplace);

    expect(documentReplace).toHaveBeenCalledWith("/dashboard");
    expect(clientReplace).not.toHaveBeenCalled();
  });
});
