"use client";

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
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
  const contentRef = useRef<HTMLDivElement>(null);
  const triggerElementRef = useRef<HTMLElement | null>(null);

  // Swipe-to-dismiss drag refs
  const isDraggingRef = useRef(false);
  const startYRef = useRef(0);
  const currentDeltaYRef = useRef(0);
  const startTimeRef = useRef(0);
  const canDragFromContentRef = useRef(false);

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

  // Touch gesture handlers for mobile bottom sheet
  const handleDragStart = (clientY: number, isContentArea = false) => {
    if (variant !== "sheet" || typeof window === "undefined" || window.innerWidth >= 640) return;

    if (isContentArea) {
      if (contentRef.current && contentRef.current.scrollTop > 2) {
        canDragFromContentRef.current = false;
        return;
      }
      canDragFromContentRef.current = true;
    } else {
      canDragFromContentRef.current = true;
    }

    isDraggingRef.current = true;
    startYRef.current = clientY;
    currentDeltaYRef.current = 0;
    startTimeRef.current = Date.now();

    // Blur active input to drop mobile keyboard when user initiates swipe down
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  const handleDragMove = (clientY: number) => {
    if (!isDraggingRef.current || !modalRef.current) return;

    const deltaY = clientY - startYRef.current;
    currentDeltaYRef.current = deltaY;

    if (deltaY > 0) {
      // Direct 1:1 translation downwards following finger
      modalRef.current.style.transition = "none";
      modalRef.current.style.transform = `translateY(${deltaY}px)`;
    } else {
      // Elastic rubber-banding when dragging upwards
      const resisted = deltaY * 0.15;
      modalRef.current.style.transition = "none";
      modalRef.current.style.transform = `translateY(${resisted}px)`;
    }
  };

  const handleDragEnd = () => {
    if (!isDraggingRef.current || !modalRef.current) return;
    isDraggingRef.current = false;

    const deltaY = currentDeltaYRef.current;
    const elapsed = Math.max(1, Date.now() - startTimeRef.current);
    const velocity = deltaY / elapsed; // px per ms

    // Dismiss if pulled down > 90px or with fast flick (velocity > 0.35)
    if (deltaY > 90 || (deltaY > 35 && velocity > 0.35)) {
      modalRef.current.style.transition = "transform 0.22s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.2s ease-out";
      modalRef.current.style.transform = "translateY(100%)";
      modalRef.current.style.opacity = "0";
      setTimeout(() => {
        onClose();
      }, 200);
    } else {
      // Snap back smoothly
      modalRef.current.style.transition = "transform 0.24s cubic-bezier(0.32, 0.72, 0, 1)";
      modalRef.current.style.transform = "translateY(0px)";
    }
  };

  // Focus trap, Escape key, and focus restoration
  useEffect(() => {
    if (!isOpen) return;

    triggerElementRef.current = document.activeElement as HTMLElement | null;

    // Reset transform on open
    if (modalRef.current) {
      modalRef.current.style.transform = "";
      modalRef.current.style.opacity = "";
      modalRef.current.style.transition = "";
    }

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

  if (!isOpen || typeof document === "undefined") return null;

  const isDialog = variant === "dialog";

  return createPortal(
    <div
      data-modal-container
      className={`fixed inset-0 z-[60] flex ${
        isDialog ? "items-center justify-center p-4 sm:p-6" : "items-end sm:items-center justify-center"
      } bg-black/45 backdrop-blur-[3px] transition-all animate-step-in`}
      style={{
        paddingBottom: bottomOffset > 0 && !isDialog ? `${bottomOffset}px` : undefined,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        ref={modalRef}
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
            className="flex justify-center pt-3 pb-1.5 sm:hidden cursor-grab active:cursor-grabbing touch-none select-none"
            aria-label="Swipe down to dismiss"
            onTouchStart={(e) => handleDragStart(e.touches[0].clientY, false)}
            onTouchMove={(e) => handleDragMove(e.touches[0].clientY)}
            onTouchEnd={handleDragEnd}
            onTouchCancel={handleDragEnd}
          >
            <div className="h-1 w-8 rounded-full bg-outline-variant/60 active:bg-on-surface-variant transition-colors" />
          </div>
        )}

        {/* Modal Header */}
        <div
          className="flex min-w-0 items-center justify-between gap-3 px-6 py-4 border-b border-border/40 bg-surface-container-low/70 select-none"
          onTouchStart={(e) => {
            if (!isDialog) {
              const target = e.target as HTMLElement | null;
              if (target && !target.closest("button")) {
                handleDragStart(e.touches[0].clientY, false);
              }
            }
          }}
          onTouchMove={(e) => {
            if (!isDialog) handleDragMove(e.touches[0].clientY);
          }}
          onTouchEnd={() => {
            if (!isDialog) handleDragEnd();
          }}
          onTouchCancel={() => {
            if (!isDialog) handleDragEnd();
          }}
        >
          <h2 id="modal-title" className="min-w-0 flex-1 truncate text-xl font-semibold text-on-surface tracking-tight">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface-muted hover:bg-surface-container-highest hover:text-on-surface active:scale-95 transition-all"
            aria-label="Close modal"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        {/* Modal Content */}
        <div
          ref={contentRef}
          className="min-w-0 flex-1 overflow-y-auto px-6 py-5 scroll-smooth overscroll-contain"
          style={{
            scrollPaddingBottom: "2.5rem",
          }}
          onTouchStart={(e) => {
            if (!isDialog && contentRef.current && contentRef.current.scrollTop <= 2) {
              handleDragStart(e.touches[0].clientY, true);
            }
          }}
          onTouchMove={(e) => {
            if (!isDialog && canDragFromContentRef.current) {
              handleDragMove(e.touches[0].clientY);
            }
          }}
          onTouchEnd={() => {
            if (!isDialog) handleDragEnd();
          }}
          onTouchCancel={() => {
            if (!isDialog) handleDragEnd();
          }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
