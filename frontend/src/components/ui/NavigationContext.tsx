"use client";

import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import { usePathname } from "next/navigation";

interface NavigationContextType {
  isNavVisible: boolean;
  isKeyboardVisible: boolean;
  isSearchActive: boolean;
  setSearchActive: (active: boolean) => void;
  setOverrideHidden: (hidden: boolean) => void;
}

const NavigationContext = createContext<NavigationContextType>({
  isNavVisible: true,
  isKeyboardVisible: false,
  isSearchActive: false,
  setSearchActive: () => {},
  setOverrideHidden: () => {},
});

/**
 * Top-level routes where the bottom navigation bar is permitted.
 * All child routes, forms, modals, and transaction flows hide the navigation bar.
 */
const PRIMARY_NAV_ROUTES = new Set([
  "/dashboard",
  "/products",
  "/reports",
  "/more",
  "/stock-count",
  "/pos",
]);

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [prevPathname, setPrevPathname] = useState(pathname);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [overrideHidden, setOverrideHidden] = useState(false);

  // Route changes reset search & override state during render (React 19 pattern)
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setIsSearchActive(false);
    setOverrideHidden(false);
  }

  // Mobile virtual keyboard detection via VisualViewport API + input focus
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleFocusChange = () => {
      const activeEl = document.activeElement;
      if (!activeEl) return;
      const isInput =
        activeEl.tagName === "INPUT" ||
        activeEl.tagName === "TEXTAREA" ||
        (activeEl as HTMLElement).isContentEditable;

      if (isInput) {
        const type = (activeEl as HTMLInputElement).type;
        if (type !== "checkbox" && type !== "radio" && type !== "hidden" && type !== "file") {
          setIsKeyboardVisible(true);
          // Ensure focused input field comes comfortably into field of view above software keyboard
          if (typeof window !== "undefined" && window.innerWidth < 1024) {
            setTimeout(() => {
              if (document.activeElement === activeEl && typeof (activeEl as HTMLElement).scrollIntoView === "function") {
                (activeEl as HTMLElement).scrollIntoView({
                  behavior: "smooth",
                  block: "center",
                  inline: "nearest",
                });
              }
            }, 180);
          }
          return;
        }
      }
      setIsKeyboardVisible(false);
    };

    const handleViewportResize = () => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          (activeEl as HTMLElement).isContentEditable);

      if (isInput) {
        const type = (activeEl as HTMLInputElement).type;
        if (type !== "checkbox" && type !== "radio" && type !== "hidden" && type !== "file") {
          setIsKeyboardVisible(true);
        }
      }

      const vv = window.visualViewport;
      if (!vv) return;
      // If visual viewport shrinks by > 120px compared to window inner height, keyboard is open
      const keyboardOpen = vv.height < window.innerHeight - 120;
      setIsKeyboardVisible(keyboardOpen);

      if (keyboardOpen && activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")) {
        setTimeout(() => {
          if (document.activeElement === activeEl && typeof (activeEl as HTMLElement).scrollIntoView === "function") {
            (activeEl as HTMLElement).scrollIntoView({
              behavior: "smooth",
              block: "center",
              inline: "nearest",
            });
          }
        }, 100);
      }
    };

    window.addEventListener("focusin", handleFocusChange, { passive: true });
    window.addEventListener("focusout", handleFocusChange, { passive: true });
    window.visualViewport?.addEventListener("resize", handleViewportResize);

    return () => {
      window.removeEventListener("focusin", handleFocusChange);
      window.removeEventListener("focusout", handleFocusChange);
      window.visualViewport?.removeEventListener("resize", handleViewportResize);
    };
  }, []);

  const isPrimaryRoute = useMemo(() => {
    return PRIMARY_NAV_ROUTES.has(pathname);
  }, [pathname]);

  const isNavVisible = useMemo(() => {
    if (!isPrimaryRoute) return false;
    if (isKeyboardVisible) return false;
    if (isSearchActive) return false;
    if (overrideHidden) return false;
    return true;
  }, [isPrimaryRoute, isKeyboardVisible, isSearchActive, overrideHidden]);

  const value = useMemo(
    () => ({
      isNavVisible,
      isKeyboardVisible,
      isSearchActive,
      setSearchActive: setIsSearchActive,
      setOverrideHidden,
    }),
    [isNavVisible, isKeyboardVisible, isSearchActive]
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation() {
  return useContext(NavigationContext);
}
