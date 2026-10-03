import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isContactPickerSupported, openNativeContactPicker } from "../contact-picker";

describe("contact-picker", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false when ContactsManager is not in window", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { contacts: {} });
    expect(isContactPickerSupported()).toBe(false);
  });

  it("returns null when contact picker is unsupported", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {});
    const result = await openNativeContactPicker();
    expect(result).toBeNull();
  });

  it("extracts name and clean phone when picker succeeds", async () => {
    const mockSelect = vi.fn().mockResolvedValue([
      { name: ["Tunde Balogun"], tel: ["080 3123 4567"] },
    ]);

    class FakeContactsManager {}

    vi.stubGlobal("window", { ContactsManager: FakeContactsManager });
    vi.stubGlobal("navigator", {
      contacts: { select: mockSelect },
    });

    expect(isContactPickerSupported()).toBe(true);

    const result = await openNativeContactPicker();
    expect(result).toEqual({
      name: "Tunde Balogun",
      phone: "08031234567",
    });
    expect(mockSelect).toHaveBeenCalledWith(["name", "tel"], { multiple: false });
  });

  it("returns null when user cancels contact picker", async () => {
    const mockSelect = vi.fn().mockRejectedValue(new Error("User cancelled"));
    class FakeContactsManager {}

    vi.stubGlobal("window", { ContactsManager: FakeContactsManager });
    vi.stubGlobal("navigator", {
      contacts: { select: mockSelect },
    });

    const result = await openNativeContactPicker();
    expect(result).toBeNull();
  });
});
