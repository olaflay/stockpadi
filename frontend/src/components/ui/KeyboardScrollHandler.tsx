"use client";

import { useEffect } from "react";

/**
 * Ensures mobile keyboards never obstruct focused inputs across any screen, form, or modal.
 * When an input receives focus or when the mobile virtual keyboard resizes the visual viewport,
 * this smoothly centers the active input in the visible field of view.
 */
export function KeyboardScrollHandler() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let scrollRaf: number | null = null;

    const scrollIntoSafeView = (el: HTMLElement) => {
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
      scrollRaf = requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      });
    };

    const isEligibleInput = (target: EventTarget | null): target is HTMLElement => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const isInput =
        el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.isContentEditable;
      if (!isInput) return false;
      const type = (el as HTMLInputElement).type;
      return type !== "checkbox" && type !== "radio" && type !== "hidden" && type !== "file";
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!isEligibleInput(event.target)) return;
      const el = event.target;
      // Staggered scroll timings to account for virtual keyboard animation (0ms, 180ms, 350ms)
      scrollIntoSafeView(el);
      window.setTimeout(() => scrollIntoSafeView(el), 180);
      window.setTimeout(() => scrollIntoSafeView(el), 350);
    };

    // When the virtual keyboard pops up or changes height, ensure the active input remains visible
    const handleViewportResize = () => {
      const activeEl = document.activeElement;
      if (isEligibleInput(activeEl)) {
        scrollIntoSafeView(activeEl);
      }
    };

    window.addEventListener("focusin", handleFocusIn, { passive: true });
    window.visualViewport?.addEventListener("resize", handleViewportResize);

    return () => {
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
      window.removeEventListener("focusin", handleFocusIn);
      window.visualViewport?.removeEventListener("resize", handleViewportResize);
    };
  }, []);

  return null;
}

