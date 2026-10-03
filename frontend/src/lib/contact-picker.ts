/**
 * Web Contacts API integration for Android / Chrome PWA.
 * Enables 1-tap contact selection directly from the user's phonebook
 * with graceful fallback when unsupported (iOS, desktop browsers).
 */

export function isContactPickerSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    "contacts" in navigator &&
    "ContactsManager" in window
  );
}

export interface PickedContact {
  name: string;
  phone: string;
}

export async function openNativeContactPicker(): Promise<PickedContact | null> {
  if (!isContactPickerSupported()) {
    return null;
  }

  try {
    const props = ["name", "tel"];
    const nav = navigator as unknown as {
      contacts: {
        select: (props: string[], opts?: { multiple?: boolean }) => Promise<Array<{ name?: string[]; tel?: string[] }>>;
      };
    };

    const contacts = await nav.contacts.select(props, { multiple: false });
    if (contacts && contacts.length > 0) {
      const selected = contacts[0];
      const rawName = Array.isArray(selected.name) ? selected.name[0] ?? "" : "";
      const rawTel = Array.isArray(selected.tel) ? selected.tel[0] ?? "" : "";

      return {
        name: rawName.trim(),
        phone: rawTel.replace(/\s+/g, ""),
      };
    }
  } catch (err) {
    // User cancelled contact selection or permission was denied
    return null;
  }

  return null;
}
