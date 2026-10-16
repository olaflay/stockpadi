"use client";

import { useEffect } from "react";
import { hideSplash } from "@/lib/splash";

/**
 * Client component that dismisses the initial HTML splash screen once
 * the React tree has mounted on the client.
 */
export function SplashScreen(): null {
  useEffect(() => {
    void hideSplash();
  }, []);

  return null;
}
