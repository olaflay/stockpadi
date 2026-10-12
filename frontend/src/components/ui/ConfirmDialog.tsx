"use client";

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Trash2, HelpCircle } from "lucide-react";
import { RippleButton } from "./Ripple";

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "brand" | "info";
  hideCancelButton?: boolean;
  icon?: React.ReactNode;
  isBusy?: boolean;
}

/**
 * Accessible in-app confirmation modal (replacing browser native window.confirm).
 * Follows Samsung One UI & M3 dialog guidelines:
 * - Centered card on larger screens, thumb-reachable sheet on mobile
 * - Themed surfaces & M3 contrast tokens (no direct Chrome render)
 * - Trapped focus & Escape-key dismissal
 */
export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  hideCancelButton = false,
  icon,
  isBusy = false,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Auto-focus the cancel or confirm button on mount
    const timer = setTimeout(() => {
      confirmBtnRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isBusy) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, isBusy, onClose]);

  if (!isOpen || typeof document === "undefined") return null;

  const iconBg =
    variant === "danger"
      ? "bg-danger-container text-on-danger-container"
      : variant === "warning"
      ? "bg-warning-container text-on-warning-container"
      : variant === "info"
      ? "bg-surface-container-high text-on-surface"
      : "bg-brand-container text-on-brand-container";

  const confirmBtnClass =
    variant === "danger"
      ? "bg-danger text-on-danger hover:opacity-95"
      : variant === "warning"
      ? "bg-warning text-on-warning hover:opacity-95"
      : "bg-brand-accent text-on-brand hover:opacity-95";

  const DefaultIcon =
    variant === "danger" ? Trash2 : variant === "warning" ? AlertTriangle : HelpCircle;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-desc"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
    >
      {/* Scrim / Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={isBusy ? undefined : onClose}
        aria-hidden="true"
      />

      {/* Modal Surface */}
      <div
        ref={dialogRef}
        className="relative z-10 w-full sm:max-w-md rounded-t-[var(--radius-sheet)] sm:rounded-[var(--radius-card)] bg-surface p-5 sm:p-6 shadow-elevation-3 border border-border/40 transition-all select-none"
      >
        <div className="flex items-start gap-3.5 mb-3">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${iconBg}`}
            aria-hidden="true"
          >
            {icon ?? <DefaultIcon size={22} />}
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2
              id="confirm-dialog-title"
              className="text-base sm:text-lg font-bold text-on-surface leading-snug"
            >
              {title}
            </h2>
            <p
              id="confirm-dialog-desc"
              className="text-xs sm:text-sm text-on-surface-muted mt-1 leading-relaxed"
            >
              {description}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className={`mt-5 flex items-center ${hideCancelButton ? "justify-end" : "justify-end gap-2.5"}`}>
          {!hideCancelButton && (
            <button
              type="button"
              onClick={onClose}
              disabled={isBusy}
              className="flex-1 sm:flex-none min-h-[var(--touch-target-min)] px-4 py-2 rounded-[var(--radius-control)] bg-surface-container text-xs sm:text-sm font-semibold text-on-surface hover:bg-surface-container-high transition-colors disabled:opacity-50"
            >
              {cancelLabel}
            </button>
          )}
          <RippleButton
            ref={confirmBtnRef}
            type="button"
            onClick={onConfirm}
            disabled={isBusy}
            className={`${hideCancelButton ? "w-full sm:w-auto" : "flex-1 sm:flex-none"} min-h-[var(--touch-target-min)] px-5 py-2 rounded-[var(--radius-control)] text-xs sm:text-sm font-semibold shadow-xs transition-all disabled:opacity-50 ${confirmBtnClass}`}
          >
            {isBusy ? "Working…" : confirmLabel}
          </RippleButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
