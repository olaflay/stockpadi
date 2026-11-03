"use client";

import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { acquireOverlayScrollLock } from "@/components/ui/overlay-scroll-lock";
import { useSheetDrag } from "@/components/ui/use-sheet-drag";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  variant?: "sheet" | "dialog";
  maxWidth?: string;
  initialFocus?: "dialog" | "first-interactive";
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
  initialFocus = "dialog",
}: ModalProps) {
  const titleId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const triggerElementRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const { sheetRef: modalRef, scrimRef, dragProps, resetDragPosition } = useSheetDrag({
    enabled: variant === "sheet" && isOpen,
    onDismiss: () => onCloseRef.current(),
  });

  // Dynamic visual viewport height and keyboard offset for mobile
  const [maxHeightStyle, setMaxHeightStyle] = React.useState<string>("90vh");
  const [bottomOffset, setBottomOffset] = React.useState<number>(0);

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") return;

    const handleResize = () => {
      const vv = window.visualViewport;
      if (vv) {
        // Calculate software keyboard height if visual viewport is reduced
        const kbHeight = Math.max(0, window.innerHeight - Math.round(vv.height + (vv.offsetTop || 0)));
        setBottomOffset(kbHeight);
        if (vv.height < window.innerHeight - 80) {
          // Keyboard is up on mobile, constrain modal so it fits cleanly above keyboard
          setMaxHeightStyle(`${Math.floor(vv.height * 0.92)}px`);
        } else {
          setMaxHeightStyle("90vh");
        }
      } else {
        setBottomOffset(0);
        setMaxHeightStyle("90vh");
      }
    };

    handleResize();
    window.visualViewport?.addEventListener("resize", handleResize);
    window.visualViewport?.addEventListener("scroll", handleResize);
    window.addEventListener("resize", handleResize);

    return () => {
      window.visualViewport?.removeEventListener("resize", handleResize);
      window.visualViewport?.removeEventListener("scroll", handleResize);
      window.removeEventListener("resize", handleResize);
    };
  }, [isOpen]);

  // Focus trap, Escape key, and focus restoration
  useEffect(() => {
    if (!isOpen) return;

    triggerElementRef.current = document.activeElement as HTMLElement | null;

    resetDragPosition();

    // Initial focus on mount
    const focusTimer = window.setTimeout(() => {
      if (modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (initialFocus === "first-interactive" && focusable.length > 0) {
          focusable[0].focus();
        } else {
          modalRef.current.focus({ preventScroll: true });
        }
      }
    }, 50);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (document.activeElement === modalRef.current || !modalRef.current.contains(document.activeElement)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        } else if (event.shiftKey && document.activeElement === first) {
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
  }, [initialFocus, isOpen, modalRef, resetDragPosition]);

  // Lock body scroll while modal is open
  useEffect(() => {
    if (!isOpen) return;
    return acquireOverlayScrollLock();
  }, [isOpen]);

  if (!isOpen || typeof document === "undefined") return null;

  const isDialog = variant === "dialog";

  return createPortal(
    <div
      ref={scrimRef}
      data-modal-container
      className={`fixed inset-0 z-[60] flex ${
        isDialog ? "items-center justify-center p-4 sm:p-6" : "items-end sm:items-center justify-center"
      } bg-black/45 animate-modal-scrim-in`}
      style={{
        paddingBottom: bottomOffset > 0 && !isDialog ? `${bottomOffset}px` : undefined,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`min-w-0 w-full ${maxWidth} flex flex-col bg-surface ${
          isDialog
            ? "rounded-[28px] border border-border/40 shadow-[0px_8px_24px_rgba(0,0,0,0.12)] animate-step-in"
            : "rounded-t-[28px] sm:rounded-[28px] border-t sm:border border-border/40 shadow-[0px_8px_24px_rgba(0,0,0,0.12)] animate-sheet-up"
        } overflow-hidden transition-transform`}
        style={{
          boxShadow: "var(--elevation-3), var(--shadow-inner-highlight)",
          maxHeight: maxHeightStyle,
        }}
      >
        {/* M3 Mobile Drag Handle — Tap & Swipe Zone */}
        {!isDialog && (
          <div
            data-sheet-drag-handle
            className="flex h-7 shrink-0 cursor-grab touch-none select-none items-center justify-center overscroll-none sm:hidden active:cursor-grabbing"
            aria-hidden="true"
            {...dragProps}
          >
            <div
              className="h-1 w-8 rounded-full bg-on-surface-muted/45 transition-colors duration-[var(--motion-duration-short)] ease-[var(--easing-standard)] active:bg-on-surface-muted/70"
            />
          </div>
        )}

        {/* Modal Header */}
        <div
          className="flex min-h-12 min-w-0 shrink-0 items-center justify-between gap-3 bg-surface px-4 py-1.5 select-none sm:px-5"
        >
          <h2 id={titleId} className="min-w-0 flex-1 truncate text-[length:var(--font-size-body-lg)] font-semibold text-on-surface tracking-tight">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="group flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-transparent text-on-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
            aria-label="Close modal"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-container-high transition-[background-color,transform] duration-[var(--motion-duration-short)] ease-[var(--easing-standard)] group-hover:bg-surface-container-highest group-active:scale-90 group-active:bg-surface-container-highest">
              <X size={16} aria-hidden />
            </span>
          </button>
        </div>

        {/* Modal Content */}
        <div
          ref={contentRef}
          className="min-w-0 flex-1 overflow-y-auto px-6 py-5 scroll-smooth overscroll-contain"
          style={{
            scrollPaddingBottom: "2.5rem",
          }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
