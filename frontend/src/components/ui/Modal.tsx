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

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && isOpen) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs transition-opacity animate-step-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        ref={modalRef}
        className={`w-full ${maxWidth} flex flex-col max-h-[90vh] bg-surface rounded-t-[var(--radius-sheet)] sm:rounded-[var(--radius-focus-block)] border-t sm:border border-border shadow-[var(--shadow-elevation-2)] overflow-hidden animate-sheet-up`}
      >
        {/* Mobile Drag Handle Pill */}
        {variant === "sheet" && (
          <div className="flex justify-center pt-2.5 pb-1 sm:hidden">
            <div className="h-1.5 w-10 rounded-full bg-border" />
          </div>
        )}

        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h2 id="modal-title" className="text-[length:var(--font-size-title)] font-bold text-on-surface">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-muted hover:bg-surface-container hover:text-on-surface transition-colors"
            aria-label="Close modal"
          >
            <X size={20} aria-hidden />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
