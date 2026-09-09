"use client";

import { useEffect, useState } from "react";

/**
 * Detects when the on-screen soft keyboard is open on mobile browsers via
 * window.visualViewport. When the keyboard opens with
 * `interactive-widget=resizes-content`, the visual viewport shrinks; a large
 * drop in height relative to window.innerHeight means the keyboard is up.
 *
 * Used to hide the bottom nav during text entry (Google Drive behaviour)
 * instead of letting `position: fixed; bottom: 0` float above the keyboard.
 */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    let lastHeight = vv.height;

    const onResize = () => {
      const ratio = vv.height / window.innerHeight;
      // Keyboard up: visual viewport drops well below layout viewport.
      // Thumb-rule: < 0.8 of the layout height means an input is being typed.
      setOpen(ratio < 0.8 && vv.height < lastHeight);
      lastHeight = vv.height;
    };

    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
    };
  }, []);

  return open;
}