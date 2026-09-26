"use client";

import { useEffect } from "react";

/**
 * Ensures mobile keyboards never obstruct focused inputs across any screen or form.
 * When an input receives focus on a mobile device, this smoothly centers it in the visible viewport.
 */
export function KeyboardScrollHandler() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleFocusIn = (event: FocusEvent) => {
      const el = event.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable) &&
        (el as HTMLInputElement).type !== "checkbox" &&
        (el as HTMLInputElement).type !== "radio"
      ) {
        // Wait for virtual keyboard emergence and visualViewport resize
        window.setTimeout(() => {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 180);
      }
    };

    window.addEventListener("focusin", handleFocusIn, { passive: true });
    return () => {
      window.removeEventListener("focusin", handleFocusIn);
    };
  }, []);

  return null;
}
