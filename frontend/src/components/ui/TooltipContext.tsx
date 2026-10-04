"use client";

import React, { createContext, useContext, useState, useCallback, useMemo } from "react";

interface TooltipContextType {
  activeTooltipId: string | null;
  openTooltip: (id: string) => void;
  closeTooltip: (id: string) => void;
}

const TooltipContext = createContext<TooltipContextType>({
  activeTooltipId: null,
  openTooltip: () => {},
  closeTooltip: () => {},
});

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  const [activeTooltipId, setActiveTooltipId] = useState<string | null>(null);

  const openTooltip = useCallback((id: string) => {
    setActiveTooltipId(id);
  }, []);

  const closeTooltip = useCallback((id: string) => {
    setActiveTooltipId((prev) => (prev === id ? null : prev));
  }, []);

  const value = useMemo(
    () => ({ activeTooltipId, openTooltip, closeTooltip }),
    [activeTooltipId, openTooltip, closeTooltip],
  );

  return <TooltipContext.Provider value={value}>{children}</TooltipContext.Provider>;
}

export function useTooltipContext() {
  return useContext(TooltipContext);
}
