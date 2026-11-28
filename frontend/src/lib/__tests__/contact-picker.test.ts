import { afterEach, describe, expect, it, vi } from "vitest";
import { isContactPickerSupported, openNativeContactPicker } from "../contact-picker";

function device(select: ReturnType<typeof vi.fn>, secure = true) {
  const frame = { isSecureContext: secure, top: {} };
  frame.top = frame;
  vi.stubGlobal("window", frame);
  vi.stubGlobal("navigator", { contacts: { select } });
}

afterEach(() => vi.unstubAllGlobals());

describe("contact picker", () => {
  it("requires a secure top-level page and a callable picker", async () => {
    device(vi.fn(), false);
    expect(isContactPickerSupported()).toBe(false);
    await expect(openNativeContactPicker()).resolves.toEqual({ status: "unavailable" });
  });

  it("opens directly in the gesture and uses the first valid number, even if the first entry is empty", async () => {
    const select = vi.fn().mockResolvedValue([{ name: ["", " Tunde Balogun "], tel: ["", "+234 (803)-123 4567"] }]);
    device(select);
    expect(isContactPickerSupported()).toBe(true);

    const result = openNativeContactPicker();
    expect(select).toHaveBeenCalledWith(["name", "tel"], { multiple: false });
    await expect(result).resolves.toEqual({ status: "selected", name: "Tunde Balogun", phone: "+2348031234567" });
  });

  it("distinguishes cancelled, withheld fields and unavailable access", async () => {
    const select = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{}])
      .mockRejectedValueOnce(new DOMException("", "AbortError"))
      .mockRejectedValueOnce(new DOMException("", "NotAllowedError"));
    device(select);
    for (const status of ["cancelled", "empty", "cancelled", "unavailable"]) {
      await expect(openNativeContactPicker()).resolves.toEqual({ status });
    }
  });
});
