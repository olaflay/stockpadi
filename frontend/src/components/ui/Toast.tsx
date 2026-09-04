"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

type ToastTone = "neutral" | "success" | "warning" | "danger";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastMessage {
  id: number;
  text: string;
  tone: ToastTone;
  action?: ToastAction;
  onClick?: () => void;
}

interface ToastContextValue {
  /**
   * showToast can accept an optional action object { label, onClick } or an onClick callback.
   * If an action object is provided, a small dedicated CTA button is rendered on the toast card.
   */
  showToast: (
    text: string,
    tone?: ToastTone,
    actionOrOnClick?: ToastAction | (() => void)
  ) => void;
  dismissToast?: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Toast styling mapped to design system colors and container tokens.
 */
const TONE_CLASSES: Record<ToastTone, { container: string; close: string; actionBtn: string }> = {
  neutral: {
    container: "border border-neutral-700/30 bg-inverse-surface text-inverse-on-surface shadow-black/20",
    close: "text-inverse-on-surface/75 hover:text-inverse-on-surface hover:bg-white/10 active:bg-white/20",
    actionBtn: "border-white/30 bg-white/15 text-inverse-on-surface hover:bg-white/25 active:bg-white/30",
  },
  success: {
    container: "border border-success-container bg-success-container text-on-success-container shadow-black/10",
    close: "text-on-success-container/75 hover:text-on-success-container hover:bg-black/5 active:bg-black/10",
    actionBtn: "border-on-success-container/30 bg-on-success-container/10 text-on-success-container hover:bg-on-success-container/20 active:bg-on-success-container/25",
  },
  warning: {
    container: "border border-warning-container bg-warning-container text-on-warning-container shadow-black/10",
    close: "text-on-warning-container/75 hover:text-on-warning-container hover:bg-black/5 active:bg-black/10",
    actionBtn: "border-on-warning-container/30 bg-on-warning-container/10 text-on-warning-container hover:bg-on-warning-container/20 active:bg-on-warning-container/25",
  },
  danger: {
    container: "border border-danger-container bg-danger-container text-on-danger-container shadow-black/10",
    close: "text-on-danger-container/75 hover:text-on-danger-container hover:bg-black/5 active:bg-black/10",
    actionBtn: "border-on-danger-container/30 bg-on-danger-container/10 text-on-danger-container hover:bg-on-danger-container/20 active:bg-on-danger-container/25",
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
    (
      text: string,
      tone: ToastTone = "neutral",
      actionOrOnClick?: ToastAction | (() => void)
    ) => {
      const id = Date.now() + Math.random();
      const action =
        typeof actionOrOnClick === "object" && actionOrOnClick !== null && "label" in actionOrOnClick
          ? actionOrOnClick
          : undefined;
      const onClick = typeof actionOrOnClick === "function" ? actionOrOnClick : undefined;

      setToasts((current) => [...current, { id, text, tone, action, onClick }]);

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
          <ToastItem
            key={toast.id}
            toast={toast}
            onDismiss={() => dismissToast(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const DISMISS_THRESHOLD_PX = 75;

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastMessage;
  onDismiss: () => void;
}) {
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const touchStartXRef = useRef(0);
  const currentDeltaXRef = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    currentDeltaXRef.current = 0;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartXRef.current === 0) return;
    const deltaX = e.touches[0].clientX - touchStartXRef.current;
    currentDeltaXRef.current = deltaX;
    setOffsetX(deltaX);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    const deltaX = currentDeltaXRef.current;
    if (Math.abs(deltaX) > DISMISS_THRESHOLD_PX) {
      // Swiped far enough in either direction -> dismiss with flyout
      setIsExiting(true);
      setOffsetX(deltaX > 0 ? 360 : -360);
      setTimeout(() => {
        onDismiss();
      }, 180);
    } else {
      // Snap back
      setOffsetX(0);
    }
    touchStartXRef.current = 0;
    currentDeltaXRef.current = 0;
  };

  const opacity = isExiting ? 0 : Math.max(0.2, 1 - Math.abs(offsetX) / 260);

  return (
    <div
      role="status"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      style={{
        transform: `translateX(${offsetX}px)`,
        opacity,
        transition: isDragging
          ? "none"
          : "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease-out",
        touchAction: "pan-y",
      }}
      className={`pointer-events-auto animate-toast-slide-down flex items-center justify-between gap-2.5 w-full max-w-md rounded-[var(--radius-control)] px-3.5 py-2.5 text-[length:var(--font-size-body)] shadow-[var(--shadow-elevation-3)] select-none cursor-grab active:cursor-grabbing ${TONE_CLASSES[toast.tone].container}`}
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

      {toast.action && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toast.action?.onClick();
            onDismiss();
          }}
          className={`shrink-0 rounded-[var(--radius-control)] px-2.5 py-1 text-[length:var(--font-size-caption)] font-bold uppercase tracking-wider border transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current ${TONE_CLASSES[toast.tone].actionBtn}`}
        >
          {toast.action.label}
        </button>
      )}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        aria-label="Cancel notification"
        title="Cancel notification"
        className={`shrink-0 inline-flex items-center justify-center rounded-full p-1.5 -mr-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current ${TONE_CLASSES[toast.tone].close}`}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      showToast: () => {},
      dismissToast: () => {},
    };
  }
  return context;
}

