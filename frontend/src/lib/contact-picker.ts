type NativeContact = { name?: string[]; tel?: string[] };
type NativeContacts = { select(properties: string[], options: { multiple: boolean }): Promise<NativeContact[]> };

function getContactPicker(): NativeContacts | undefined {
  if (typeof window === "undefined" || !window.isSecureContext || window.top !== window) return;
  const contacts = (navigator as Navigator & { contacts?: NativeContacts }).contacts;
  return typeof contacts?.select === "function" ? contacts : undefined;
}

export function isContactPickerSupported(): boolean {
  return Boolean(getContactPicker());
}

export type ContactPickerResult =
  | { status: "selected"; name: string; phone: string }
  | { status: "cancelled" | "unavailable" | "empty" };

export async function openNativeContactPicker(): Promise<ContactPickerResult> {
  const picker = getContactPicker();
  if (!picker) return { status: "unavailable" };

  try {
    // Call directly in the button gesture, before awaiting anything else.
    const [selected] = await picker.select(["name", "tel"], { multiple: false });
    if (!selected) return { status: "cancelled" };

    const name = (selected.name ?? []).map((value) => value.trim()).find(Boolean) ?? "";
    const phone = (selected.tel ?? []).map((value) => value.trim().replace(/[\s().-]/g, ""))
      .find((value) => /^\+?\d+$/.test(value)) ?? "";
    return name || phone ? { status: "selected", name, phone } : { status: "empty" };
  } catch (error) {
    return { status: error instanceof DOMException && error.name === "AbortError" ? "cancelled" : "unavailable" };
  }
}
