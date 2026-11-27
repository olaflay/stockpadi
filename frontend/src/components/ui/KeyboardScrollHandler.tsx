"use client";

import { useEffect } from "react";
import { createKeyboardViewportTracker, isKeyboardTextEntry } from "@/lib/keyboard-text-entry";

/**
 * Ensures mobile keyboards never obstruct focused inputs across any screen, form, or modal.
 * When an input receives focus or when the mobile virtual keyboard resizes the visual viewport,
 * this smoothly centers the active input in the visible field of view.
 */
export function KeyboardScrollHandler() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let scrollRaf: number | null = null;
    let viewportKeyboardOpen = false;
    const readKeyboardViewport = createKeyboardViewportTracker();
    const root = document.documentElement;

    const scrollIntoSafeView = (el: HTMLElement) => {
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
      scrollRaf = requestAnimationFrame(() => {
        if (document.activeElement !== el) return;
        const viewport = window.visualViewport;
        const rect = el.getBoundingClientRect();
        const top = viewport?.offsetTop ?? 0;
        const bottom = top + (viewport?.height ?? window.innerHeight);
        if (rect.top < top + 12 || rect.bottom > bottom - 16) {
          el.scrollIntoView({ behavior: "instant", block: "center", inline: "nearest" });
        }
      });
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!isKeyboardTextEntry(event.target)) return;
      const el = event.target;
      // Staggered scroll timings to account for virtual keyboard animation (0ms, 180ms, 350ms)
      scrollIntoSafeView(el);
      window.setTimeout(() => scrollIntoSafeView(el), 180);
      window.setTimeout(() => scrollIntoSafeView(el), 350);
    };

    // When the virtual keyboard pops up or changes height, ensure the active input remains visible
    const handleViewportResize = () => {
      const activeEl = document.activeElement;
      const state = readKeyboardViewport();
      if (!state) return;
      const { open: keyboardOpen, viewport } = state;
      const closed = viewportKeyboardOpen && !keyboardOpen && (viewport.scale ?? 1) <= 1.01;
      viewportKeyboardOpen = keyboardOpen;
      if (keyboardOpen) root.style.setProperty("--app-visible-height", `${Math.floor(viewport.height)}px`);
      else root.style.removeProperty("--app-visible-height");
      if (!isKeyboardTextEntry(activeEl)) return;
      if (closed) activeEl.blur();
      else if (keyboardOpen) {
        scrollIntoSafeView(activeEl);
      }
    };

    const handleOutsideTap = (event: PointerEvent) => {
      const activeEl = document.activeElement;
      if (event.pointerType === "mouse" || !isKeyboardTextEntry(activeEl) || !(event.target instanceof Element)) return;
      if (activeEl.contains(event.target) || event.target.closest("input, textarea, label, [contenteditable]")) return;
      activeEl.blur();
    };

    window.addEventListener("focusin", handleFocusIn, { passive: true });
    document.addEventListener("pointerdown", handleOutsideTap, { passive: true, capture: true });
    window.addEventListener("resize", handleViewportResize);
    window.visualViewport?.addEventListener("resize", handleViewportResize);
    window.visualViewport?.addEventListener("scroll", handleViewportResize);

    return () => {
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
      window.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("pointerdown", handleOutsideTap, true);
      window.removeEventListener("resize", handleViewportResize);
      window.visualViewport?.removeEventListener("resize", handleViewportResize);
      window.visualViewport?.removeEventListener("scroll", handleViewportResize);
      root.style.removeProperty("--app-visible-height");
    };
  }, []);

  return null;
}

