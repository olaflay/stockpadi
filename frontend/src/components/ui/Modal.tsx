"use client";

import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  variant?: "sheet" | "dialog";
  maxWidth?: string;
}

/**
 * Samsung One UI Modal & Bottom Sheet.
 * On mobile, renders as a bottom sheet within natural thumb reach.
 * On larger screens, centers gracefully as a dialog.
 */
export function Modal({
  isOpen,
  onClose,
  title,
  children,
  variant = "sheet",
  maxWidth = "max-w-md",
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const triggerElementRef = useRef<HTMLElement | null>(null);

  // Focus trap, Escape key, and focus restoration
  useEffect(() => {
    if (!isOpen) return;

    triggerElementRef.current = document.activeElement as HTMLElement | null;

    // Initial focus on mount
    const focusTimer = setTimeout(() => {
      if (modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) {
          focusable[0].focus();
        } else {
          modalRef.current.focus();
        }
      }
    }, 50);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      triggerElementRef.current?.focus();
    };
  }, [isOpen, onClose]);

  // Lock body scroll while modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[var(--color-scrim)] transition-opacity animate-step-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        ref={modalRef}
        className={`w-full ${maxWidth} flex flex-col max-h-[90vh] bg-surface rounded-t-[var(--radius-sheet)] sm:rounded-[var(--radius-focus-block)] border-t sm:border border-border/80 shadow-[var(--shadow-elevation-3)] overflow-hidden animate-sheet-up`}
        style={{ boxShadow: "var(--elevation-3), var(--shadow-inner-highlight)" }}
      >
        {/* M3 Mobile Drag Handle */}
        {variant === "sheet" && (
          <div className="flex justify-center pt-3 pb-1 sm:hidden" aria-hidden>
            <div className="h-1 w-8 rounded-full bg-on-surface-muted/30" />
          </div>
        )}

        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/60 bg-surface-container-low">
          <h2 id="modal-title" className="text-base sm:text-lg font-semibold text-on-surface">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-muted hover:bg-surface-container-high hover:text-on-surface active:scale-95 transition-all"
            aria-label="Close modal"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
