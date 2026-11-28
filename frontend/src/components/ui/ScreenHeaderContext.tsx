"use client";

import { createContext, useContext, useLayoutEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { usePathname } from "next/navigation";

export interface AppScreenHeader {
  title: string;
  onBack?: () => void;
  fallbackHref?: string;
}

type Registration = { pathname: string; header: AppScreenHeader };
const RegisterHeader = createContext<Dispatch<SetStateAction<Registration | null>> | null>(null);
const ActiveHeader = createContext<Registration | null>(null);

export function ScreenHeaderProvider({ children }: { children: ReactNode }) {
  const [header, setHeader] = useState<Registration | null>(null);
  return (
    <RegisterHeader.Provider value={setHeader}>
      <ActiveHeader.Provider value={header}>{children}</ActiveHeader.Provider>
    </RegisterHeader.Provider>
  );
}

export function useAppScreenHeader(pathname: string): AppScreenHeader | undefined {
  const entry = useContext(ActiveHeader);
  return entry?.pathname === pathname ? entry.header : undefined;
}

export function useRegisterScreenHeader(header: AppScreenHeader): boolean {
  const register = useContext(RegisterHeader);
  const pathname = usePathname();
  const { title, onBack, fallbackHref } = header;
  useLayoutEffect(() => {
    if (!register) return;
    const entry = { pathname, header: { title, onBack, fallbackHref } };
    register(entry);
    return () => register((current) => current === entry ? null : current);
  }, [register, pathname, title, onBack, fallbackHref]);
  return Boolean(register);
}
