import { useCallback, useState } from "react";

/**
 * Drop-in replacement for useState that persists the value to sessionStorage.
 * Survives client-side navigation (Next.js soft routing) because the tab stays
 * alive, but clears automatically when the browser tab is closed — so stale
 * draft data never bleeds across days.
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
  const [value, setValueRaw] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const stored = sessionStorage.getItem(key);
      return stored !== null ? (JSON.parse(stored) as T) : initial;
    } catch {
      return initial;
    }
  });

  const setValue = useCallback(
    (updater: T | ((prev: T) => T)) => {
      setValueRaw((prev) => {
        const next = typeof updater === "function"
          ? (updater as (prev: T) => T)(prev)
          : updater;
        try {
          sessionStorage.setItem(key, JSON.stringify(next));
        } catch {
          // sessionStorage may be unavailable in private browsing on some
          // browsers — fail silently and the state still works in memory.
        }
        return next;
      });
    },
    [key]
  );

  const clearDraft = useCallback(() => {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
    setValueRaw(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [value, setValue, clearDraft];
}
