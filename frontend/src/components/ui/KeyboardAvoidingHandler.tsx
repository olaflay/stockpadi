"use client";

import { useEffect } from "react";

/**
 * Mobile keyboard-avoiding behavior:
 * When an input element is focused on a mobile device, the virtual keyboard appears.
 * This listener runs `element.scrollIntoView({ behavior: 'smooth', block: 'center' })`
 * so the input field moves smoothly into the viewable area above the keyboard
 * without distorting or breaking the bottom navigation bar.
 */
export function KeyboardAvoidingHandler() {
  useEffect(() => {
    function handleFocusIn(e: FocusEvent) {
      const target = e.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        // Skip non-textual input types
        if (
          target instanceof HTMLInputElement &&
          ["checkbox", "radio", "hidden", "file", "button", "submit", "reset"].includes(target.type)
        ) {
          return;
        }

        // Slight delay allows the mobile browser virtual keyboard animation to engage
        setTimeout(() => {
          if (document.activeElement === target) {
            target.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }, 150);
      }
    }

    window.addEventListener("focusin", handleFocusIn);
    return () => {
      window.removeEventListener("focusin", handleFocusIn);
    };
  }, []);

  return null;
}
