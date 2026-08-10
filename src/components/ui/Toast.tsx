"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

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
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Toast styling mapped to design system colors and container tokens.
 */
const TONE_CLASSES: Record<ToastTone, string> = {
  neutral: "bg-inverse-surface text-inverse-on-surface",
  success: "border border-success-container bg-success-container text-on-success-container",
  warning: "border border-warning-container bg-warning-container text-on-warning-container",
  danger: "border border-danger-container bg-danger-container text-on-danger-container",
};

/**
 * Brief, dismissible toast for high-frequency actions (completing a sale).
 * Never a modal that requires a tap to dismiss on something done dozens of
 * times a shift. Auto-dismisses; a manual close is also available.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((text: string, tone: ToastTone = "neutral", onClick?: () => void) => {
    const id = Date.now();
    setToasts((current) => [...current, { id, text, tone, onClick }]);
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3000);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((toast) =>
          toast.onClick ? (
            <button
              key={toast.id}
              type="button"
              role="status"
              onClick={toast.onClick}
              className={`pointer-events-auto animate-step-in rounded-[var(--radius-control)] px-4 py-2 text-left text-[length:var(--font-size-body)] shadow-[var(--shadow-elevation-2)] underline decoration-dotted underline-offset-4 ${TONE_CLASSES[toast.tone]}`}
            >
              {toast.text}
            </button>
          ) : (
            <div
              key={toast.id}
              role="status"
              className={`pointer-events-auto animate-step-in rounded-[var(--radius-control)] px-4 py-2 text-[length:var(--font-size-body)] shadow-[var(--shadow-elevation-2)] ${TONE_CLASSES[toast.tone]}`}
            >
              {toast.text}
            </div>
          )
        )}
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
