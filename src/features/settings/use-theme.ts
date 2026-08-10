"use client";

import { useContext } from "react";
import { ThemeContext } from "@/features/settings/ThemeProvider";

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider (src/app/layout.tsx).");
  }
  return ctx;
}
