"use client";

import { useEffect, useState } from "react";

/**
 * Detects when the on-screen soft keyboard is open on mobile browsers via
 * the VisualViewport API and focused text-entry inputs.
 *
 * When an input receives focus on a touch device or when the visual viewport
 * drops significantly (> 100px below window.innerHeight), this returns true.
 *
 * Used to hide fixed/sticky bottom action bars (CTA buttons, bottom nav)
 * during text entry so they never float upward to obstruct inputs or squash the screen.
 */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const isTouchMobile = () =>
      window.innerWidth < 1024 &&
      ("ontouchstart" in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0));

    const checkState = () => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          (activeEl as HTMLElement).isContentEditable);

      const type = (activeEl as HTMLInputElement)?.type;
      const isTextInput =
        Boolean(isInput) &&
        type !== "checkbox" &&
        type !== "radio" &&
        type !== "hidden" &&
        type !== "file";

      const vv = window.visualViewport;
      // If visual viewport height shrunk by > 100px relative to window height, keyboard is open
      const viewportShrunk = vv ? vv.height < window.innerHeight - 100 : false;

      if (isTouchMobile() && (isTextInput || viewportShrunk)) {
        setOpen(true);
      } else if (viewportShrunk) {
        setOpen(true);
      } else {
        setOpen(false);
      }
    };

    let timer: ReturnType<typeof setTimeout> | null = null;

    const handleFocus = () => {
      if (timer) clearTimeout(timer);
      checkState();
    };

    const handleBlur = () => {
      if (timer) clearTimeout(timer);
      // Small tick so focus transitioning between inputs does not flicker
      timer = setTimeout(checkState, 60);
    };

    const handleViewportChange = () => {
      checkState();
    };

    window.addEventListener("focusin", handleFocus, { passive: true });
    window.addEventListener("focusout", handleBlur, { passive: true });
    window.visualViewport?.addEventListener("resize", handleViewportChange);
    window.visualViewport?.addEventListener("scroll", handleViewportChange);

    // Initial check in case rendered while input already focused
    checkState();

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("focusin", handleFocus);
      window.removeEventListener("focusout", handleBlur);
      window.visualViewport?.removeEventListener("resize", handleViewportChange);
      window.visualViewport?.removeEventListener("scroll", handleViewportChange);
    };
  }, []);

  return open;
}