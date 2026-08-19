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
        errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [errorState]);

  return errorRef;
}
