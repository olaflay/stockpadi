import { useCallback, useState } from "react";

const DRAFT_MAX_AGE_MS = 48 * 60 * 60 * 1000; // 48 hours

interface StoredDraftEnvelope<T> {
  savedAt: number;
  data: T;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  }
}

export function loadDraft<T>(key: string, fallback: T): T {
  const storage = getStorage();
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    // Envelope format with savedAt timestamp
    if (parsed && typeof parsed === "object" && "savedAt" in parsed && "data" in parsed) {
      const envelope = parsed as StoredDraftEnvelope<T>;
      if (Date.now() - envelope.savedAt > DRAFT_MAX_AGE_MS) {
        storage.removeItem(key);
        return fallback;
      }
      return envelope.data;
    }
    // Backward compatibility for raw stored values
    return parsed as T;
  } catch {
    return fallback;
  }
}

export function saveDraft<T>(key: string, data: T): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    const envelope: StoredDraftEnvelope<T> = {
      savedAt: Date.now(),
      data,
    };
    storage.setItem(key, JSON.stringify(envelope));
  } catch {
    // Storage quota or private browsing error — silent fallback
  }
}

export function clearDraftStorage(key: string): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * Drop-in replacement for useState that persists form draft to localStorage.
 * Survives hard reloads, mobile tab suspension, and accidental browser closures.
 * Drafts older than 48 hours automatically expire.
 *
 * Usage:
 *   const [lines, setLines, clearLines] = useDraft("stockpadi-draft-restock", {});
 *   // After successful submit:
 *   clearLines();
 */
export function useDraft<T>(
  key: string,
  initial: T
): [T, (updater: T | ((prev: T) => T)) => void, () => void] {
  const [value, setValueRaw] = useState<T>(() => loadDraft<T>(key, initial));

  const setValue = useCallback(
    (updater: T | ((prev: T) => T)) => {
      setValueRaw((prev) => {
        const next =
          typeof updater === "function"
            ? (updater as (prev: T) => T)(prev)
            : updater;
        saveDraft(key, next);
        return next;
      });
    },
    [key]
  );

  const clearDraft = useCallback(() => {
    clearDraftStorage(key);
    setValueRaw(initial);
  }, [key, initial]);

  return [value, setValue, clearDraft];
}
