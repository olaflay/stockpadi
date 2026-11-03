"use client";

import { useCallback, useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";

interface UseSheetDragOptions {
  enabled: boolean;
  onDismiss: () => void;
}

interface SheetDragResult {
  sheetRef: RefObject<HTMLDivElement | null>;
  scrimRef: RefObject<HTMLDivElement | null>;
  dragProps: {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  };
  resetDragPosition: () => void;
}

const DISMISS_DISTANCE_RATIO = 0.45;
const DISMISS_VELOCITY_PX_PER_MS = 0.55;

/** Direct-manipulation gesture shared by mobile bottom sheets. */
export function useSheetDrag({ enabled, onDismiss }: UseSheetDragOptions): SheetDragResult {
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const activePointerRef = useRef<number | null>(null);
  const startYRef = useRef(0);
  const deltaYRef = useRef(0);
  const startTimeRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  const resetDragPosition = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    const sheet = sheetRef.current;
    if (sheet) {
      sheet.style.transition = "";
      sheet.style.transform = "";
      sheet.style.opacity = "";
    }
    const scrim = scrimRef.current;
    if (scrim) {
      scrim.style.transition = "";
      scrim.style.opacity = "";
    }
    activePointerRef.current = null;
    deltaYRef.current = 0;
  }, []);

  useEffect(() => () => {
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
  }, []);

  const canDrag = () => enabled && typeof window !== "undefined" && window.innerWidth < 640;

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!canDrag() || !sheetRef.current) return;
    activePointerRef.current = event.pointerId;
    startYRef.current = event.clientY;
    deltaYRef.current = 0;
    startTimeRef.current = performance.now();
    event.currentTarget.setPointerCapture?.(event.pointerId);

    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (activePointerRef.current !== event.pointerId || !sheetRef.current) return;
    const delta = Math.max(0, event.clientY - startYRef.current);
    deltaYRef.current = delta;

    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = requestAnimationFrame(() => {
      const sheet = sheetRef.current;
      if (!sheet) return;
      const height = Math.max(1, sheet.getBoundingClientRect().height);
      const progress = Math.min(delta / height, 1);
      sheet.style.transition = "none";
      sheet.style.transform = `translate3d(0, ${delta}px, 0)`;
      if (scrimRef.current) {
        scrimRef.current.style.transition = "none";
        scrimRef.current.style.opacity = `${Math.max(0.18, 1 - progress * 0.82)}`;
      }
    });
  };

  const finishDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (activePointerRef.current !== event.pointerId || !sheetRef.current) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    activePointerRef.current = null;

    const sheet = sheetRef.current;
    const delta = deltaYRef.current;
    const elapsed = Math.max(1, performance.now() - startTimeRef.current);
    const velocity = delta / elapsed;
    const height = Math.max(1, sheet.getBoundingClientRect().height);
    const shouldDismiss = delta >= height * DISMISS_DISTANCE_RATIO || (delta >= 32 && velocity >= DISMISS_VELOCITY_PX_PER_MS);
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    if (shouldDismiss) {
      if (reduceMotion) {
        onDismissRef.current();
        return;
      }
      sheet.style.transition = "transform var(--motion-duration-medium) var(--easing-emphasized-accelerate), opacity var(--motion-duration-medium) linear";
      sheet.style.transform = "translate3d(0, 100%, 0)";
      sheet.style.opacity = "0.98";
      if (scrimRef.current) {
        scrimRef.current.style.transition = "opacity var(--motion-duration-medium) linear";
        scrimRef.current.style.opacity = "0";
      }
      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null;
        onDismissRef.current();
      }, 200);
      return;
    }

    sheet.style.transition = "transform var(--motion-duration-medium) var(--easing-emphasized-decelerate)";
    sheet.style.transform = "translate3d(0, 0, 0)";
    if (scrimRef.current) {
      scrimRef.current.style.transition = "opacity var(--motion-duration-medium) var(--easing-standard)";
      scrimRef.current.style.opacity = "1";
    }
    deltaYRef.current = 0;
  };

  const cancelDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (activePointerRef.current !== event.pointerId || !sheetRef.current) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    activePointerRef.current = null;
    deltaYRef.current = 0;
    sheetRef.current.style.transition = "transform var(--motion-duration-medium) var(--easing-emphasized-decelerate)";
    sheetRef.current.style.transform = "translate3d(0, 0, 0)";
    if (scrimRef.current) {
      scrimRef.current.style.transition = "opacity var(--motion-duration-medium) var(--easing-standard)";
      scrimRef.current.style.opacity = "1";
    }
  };

  return {
    sheetRef,
    scrimRef,
    dragProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finishDrag,
      onPointerCancel: cancelDrag,
    },
    resetDragPosition,
  };
}
