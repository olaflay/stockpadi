let activeLocks = 0;
let previousOverflow = "";

/** Reference-counted lock so closing one overlay cannot unlock another. */
export function acquireOverlayScrollLock(): () => void {
  if (typeof document === "undefined") return () => undefined;
  if (activeLocks === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  activeLocks += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeLocks = Math.max(0, activeLocks - 1);
    if (activeLocks === 0) {
      document.body.style.overflow = previousOverflow;
      previousOverflow = "";
    }
  };
}
