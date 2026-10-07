import { useEffect, type RefObject } from "react";

/** Keeps focus inside the auth scroll region without moving the document. */
export function useAuthFieldVisibility(regionRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const region = regionRef.current;
    if (!region) return;
    let frame: number | null = null;
    let timer: number | null = null;

    const reveal = (target: Element | null) => {
      if (!(target instanceof HTMLElement) || !region.contains(target)) return;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const viewport = window.visualViewport;
        const viewportTop = viewport?.offsetTop ?? 0;
        const viewportBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
        const rect = target.getBoundingClientRect();
        const margin = 24;
        const delta = rect.bottom > viewportBottom - margin
          ? rect.bottom - (viewportBottom - margin)
          : rect.top < viewportTop + margin
            ? rect.top - (viewportTop + margin)
            : 0;
        if (delta !== 0) region.scrollTop += delta;
      });
    };

    const handleFocusIn = (event: FocusEvent) => {
      reveal(event.target as Element | null);
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => reveal(document.activeElement), 160);
    };
    const handleViewportResize = () => reveal(document.activeElement);

    region.addEventListener("focusin", handleFocusIn);
    window.visualViewport?.addEventListener("resize", handleViewportResize);
    window.visualViewport?.addEventListener("scroll", handleViewportResize);
    return () => {
      region.removeEventListener("focusin", handleFocusIn);
      window.visualViewport?.removeEventListener("resize", handleViewportResize);
      window.visualViewport?.removeEventListener("scroll", handleViewportResize);
      if (frame !== null) cancelAnimationFrame(frame);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [regionRef]);
}
