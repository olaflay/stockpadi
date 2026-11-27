"use client";

import { useEffect, useState } from "react";
import { createKeyboardViewportTracker, isKeyboardTextEntry } from "@/lib/keyboard-text-entry";

/**
 * Detects when the on-screen soft keyboard is open on mobile browsers via
 * the VisualViewport API and focused text-entry inputs.
 *
 * On browsers exposing the visual viewport, geometry is authoritative.
 * Some mobile browsers retain input focus after dismissing the keyboard.
 *
 * Used to hide fixed/sticky bottom action bars (CTA buttons, bottom nav)
 * during text entry so they never float upward to obstruct inputs or squash the screen.
 */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const readKeyboardViewport = createKeyboardViewportTracker();

    const isTouchMobile = () =>
      window.innerWidth < 1024 &&
      ("ontouchstart" in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0));

    const checkState = () => {
      const viewport = readKeyboardViewport();
      setOpen(viewport?.open ?? Boolean(isTouchMobile() && isKeyboardTextEntry(document.activeElement)));
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
    window.addEventListener("resize", handleViewportChange);
    window.visualViewport?.addEventListener("resize", handleViewportChange);
    window.visualViewport?.addEventListener("scroll", handleViewportChange);

    // Initial check in case rendered while input already focused
    checkState();

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("focusin", handleFocus);
      window.removeEventListener("focusout", handleBlur);
      window.removeEventListener("resize", handleViewportChange);
      window.visualViewport?.removeEventListener("resize", handleViewportChange);
      window.visualViewport?.removeEventListener("scroll", handleViewportChange);
    };
  }, []);

  return open;
}
