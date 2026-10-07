import { useEffect, useRef } from "react";

/**
 * A generalized hook for forms to automatically scroll to an error message when it appears.
 * Returns a React ref that should be attached to the error container.
 * 
 * @param errorState The state variable that indicates an error exists (e.g. the error string)
 */
export function useScrollToError<T extends HTMLElement>(errorState: unknown) {
  const errorRef = useRef<T>(null);

  useEffect(() => {
    if (errorState && errorRef.current) {
      // A slight delay ensures React has committed the DOM update and the 
      // layout engine has recalculated the container heights before scrolling.
      const timer = setTimeout(() => {
        const error = errorRef.current;
        if (!error) return;
        const region = error.closest<HTMLElement>("[data-auth-scroll-region]");
        if (!region) {
          error.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }
        const regionRect = region.getBoundingClientRect();
        const errorRect = error.getBoundingClientRect();
        const margin = 24;
        if (errorRect.top < regionRect.top + margin) region.scrollTop += errorRect.top - (regionRect.top + margin);
        if (errorRect.bottom > regionRect.bottom - margin) region.scrollTop += errorRect.bottom - (regionRect.bottom - margin);
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [errorState]);

  return errorRef;
}
