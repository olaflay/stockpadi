const DRAFT_KEY = "stockpadi-pwa-reload-drafts-v1";
const RESTORED_KEY = "stockpadi-pwa-reload-drafts-restored-v1";

interface SavedControl {
  key: string;
  index: number;
  occurrence?: number;
  type: string;
  value: string;
  checked?: boolean;
}

interface SavedForm {
  key: string;
  controls: SavedControl[];
}

interface SavedDraftSet {
  id: string;
  pathname: string;
  forms: SavedForm[];
}

function isSensitive(control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): boolean {
  if (control instanceof HTMLInputElement && ["password", "hidden", "file"].includes(control.type)) return true;
  return /password|token|secret|authorization|one.?time.?code|otp/i.test(`${control.name} ${control.id} ${control.autocomplete}`);
}

function setControlValue(control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), "value")?.set;
  if (setter) setter.call(control, value);
  else control.value = value;
}

/** Capture editable form values before a forced document reload. Never stores auth credentials. */
export function persistFormDraftsForReload(): void {
  if (typeof window === "undefined") return;
  try {
    const forms = Array.from(document.forms).map((form, formIndex): SavedForm => {
      const occurrences = new Map<string, number>();
      const controls: SavedControl[] = Array.from(form.elements)
        .filter((control): control is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement =>
          control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement)
        .filter((control) => !isSensitive(control))
        .map((control, index) => {
          const key = control.name || control.id;
          const occurrence = occurrences.get(key) ?? 0;
          occurrences.set(key, occurrence + 1);
          return {
            key,
            index,
            occurrence,
            type: control instanceof HTMLInputElement ? control.type : control.tagName.toLowerCase(),
            value: control.value,
            ...(control instanceof HTMLInputElement && ["checkbox", "radio"].includes(control.type) ? { checked: control.checked } : {}),
          };
        });
      return { key: form.id || `form-${formIndex}`, controls };
    }).filter((form) => form.controls.length > 0);
    if (!forms.length) return;
    const draft: SavedDraftSet = { id: crypto.randomUUID(), pathname: window.location.pathname, forms };
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    window.sessionStorage.setItem(RESTORED_KEY, `pending:${draft.id}`);
  } catch {
    // Draft capture is best-effort; it never blocks an update or touches existing app drafts.
  }
}

/** Restore only the captured page and leave both the app's cart key and this draft intact. */
export function restoreFormDraftsAfterReload(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    const draft = JSON.parse(raw) as SavedDraftSet;
    if (!draft?.id || draft.pathname !== window.location.pathname) return;
    if (window.sessionStorage.getItem(RESTORED_KEY) === `restored:${draft.id}`) return;

    for (const savedForm of draft.forms) {
      const form = savedForm.key.startsWith("form-")
        ? document.forms[Number(savedForm.key.slice(5))]
        : document.getElementById(savedForm.key) as HTMLFormElement | null;
      if (!form) continue;
      for (const saved of savedForm.controls) {
        const candidates = Array.from(form.elements).filter((control): control is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement =>
          control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement);
        const matches = candidates.filter((control) => (control.name || control.id) === saved.key);
        const control = matches[saved.occurrence ?? saved.index] ?? candidates[saved.index];
        if (!control || isSensitive(control)) continue;
        if (control instanceof HTMLInputElement && ["checkbox", "radio"].includes(control.type)) {
          const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), "checked")?.set;
          if (setter) setter.call(control, saved.checked ?? false);
          else control.checked = saved.checked ?? false;
        } else {
          setControlValue(control, saved.value);
        }
        control.dispatchEvent(new Event("input", { bubbles: true }));
        control.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    window.sessionStorage.setItem(RESTORED_KEY, `restored:${draft.id}`);
  } catch {
    // Corrupt/unsupported draft data is ignored without touching other storage or app data.
  }
}
