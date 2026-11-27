"use client";

import React, { createContext, useContext, useState, useMemo } from "react";
import { usePathname } from "next/navigation";
import { useKeyboardOpen } from "@/hooks/use-keyboard-open";

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
 * Dedicated form creation flows and transactional wizards where the navigation bar
 * is delicately hidden to grant full-screen focus to form fields and avoid sticky CTA collision.
 * On all other standard app pages and sub-routes, the navigation bar remains visible.
 */
const DELICATE_FORM_FLOWS = [
  "/products/new",
  "/settings/business",
  "/expenses/new",
  "/purchases/new",
  "/staff/new",
  "/close-day",
  "/welcome",
  "/onboarding",
];

export function isNavAllowedOnRoute(pathname: string): boolean {
  if (!pathname) return false;
  const route = pathname.replace(/^\/(business|work)(?=\/|$)/, "") || "/dashboard";
  if (/^\/products\/[^/]+$/.test(route) && route !== "/products/import") return false;
  return !DELICATE_FORM_FLOWS.some((flow) => route === flow || route.startsWith(`${flow}/`));
}

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [prevPathname, setPrevPathname] = useState(pathname);
  const isKeyboardVisible = useKeyboardOpen();
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [overrideHidden, setOverrideHidden] = useState(false);

  // Route changes reset search & override state during render (React 19 pattern)
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setIsSearchActive(false);
    setOverrideHidden(false);
  }

  const isPrimaryRoute = useMemo(() => {
    return isNavAllowedOnRoute(pathname);
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
