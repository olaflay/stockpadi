"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

type ToastTone = "neutral" | "success" | "warning" | "danger";

interface ToastMessage {
  id: number;
  text: string;
  tone: ToastTone;
  onClick?: () => void;
}

interface ToastContextValue {
  /**
   * onClick makes the toast tappable (e.g. "Sale completed · View receipt")
   * without turning it into a modal — it still auto-dismisses on its own,
   * a tap just navigates instead of doing nothing. Never required: every
   * existing call site with no onClick renders exactly as before.
   */
  showToast: (text: string, tone?: ToastTone, onClick?: () => void) => void;
  dismissToast?: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Toast styling mapped to design system colors and container tokens.
 */
const TONE_CLASSES: Record<ToastTone, { container: string; close: string }> = {
  neutral: {
    container: "border border-neutral-700/30 bg-inverse-surface text-inverse-on-surface shadow-black/20",
    close: "text-inverse-on-surface/75 hover:text-inverse-on-surface hover:bg-white/10 active:bg-white/20",
  },
  success: {
    container: "border border-success-container bg-success-container text-on-success-container shadow-black/10",
    close: "text-on-success-container/75 hover:text-on-success-container hover:bg-black/5 active:bg-black/10",
  },
  warning: {
    container: "border border-warning-container bg-warning-container text-on-warning-container shadow-black/10",
    close: "text-on-warning-container/75 hover:text-on-warning-container hover:bg-black/5 active:bg-black/10",
  },
  danger: {
    container: "border border-danger-container bg-danger-container text-on-danger-container shadow-black/10",
    close: "text-on-danger-container/75 hover:text-on-danger-container hover:bg-black/5 active:bg-black/10",
  },
};

const TOAST_DURATION_MS = 5000;

/**
 * Dismissible toast for high-frequency actions (completing a sale, saving products, errors).
 * Lasts for ~5 seconds, slides down from the top of the screen, and includes a cancel/dismiss
 * button on every toast so users can dismiss them before they disappear.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const timersRef = useRef<Map<number, NodeJS.Timeout>>(new Map());

  const dismissToast = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (text: string, tone: ToastTone = "neutral", onClick?: () => void) => {
      const id = Date.now() + Math.random();
      setToasts((current) => [...current, { id, text, tone, onClick }]);

      const timer = setTimeout(() => {
        dismissToast(id);
      }, TOAST_DURATION_MS);

      timersRef.current.set(id, timer);
    },
    [dismissToast]
  );

  useEffect(() => {
    const activeTimers = timersRef.current;
    return () => {
      activeTimers.forEach((timer) => clearTimeout(timer));
      activeTimers.clear();
    };
  }, []);

  const value = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-3 sm:top-4 z-[9999] flex flex-col items-center gap-2 px-4 pt-[env(safe-area-inset-top,0px)]"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto animate-toast-slide-down flex items-center justify-between gap-3 w-full max-w-md rounded-[var(--radius-control)] px-3.5 py-2.5 text-[length:var(--font-size-body)] shadow-[var(--shadow-elevation-3)] ${TONE_CLASSES[toast.tone].container}`}
          >
            {toast.onClick ? (
              <button
                type="button"
                onClick={toast.onClick}
                className="flex-1 text-left font-medium underline decoration-dotted underline-offset-4 hover:opacity-90 active:opacity-75 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current rounded"
              >
                {toast.text}
              </button>
            ) : (
              <span className="flex-1 font-medium leading-snug">{toast.text}</span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                dismissToast(toast.id);
              }}
              aria-label="Cancel notification"
              title="Cancel notification"
              className={`shrink-0 inline-flex items-center justify-center rounded-full p-1.5 -mr-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current ${TONE_CLASSES[toast.tone].close}`}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

