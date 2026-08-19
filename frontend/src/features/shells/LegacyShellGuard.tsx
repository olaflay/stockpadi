"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/features/auth/use-current-user";

/** Keeps legacy shared routes owner-only while the dedicated shells are used. */
export function LegacyShellGuard({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser();
  const router = useRouter();

  useEffect(() => {
    if (user.accountType === "ADMIN") router.replace("/admin");
    if (user.accountType === "WORKER") router.replace("/work");
  }, [router, user.accountType]);

  if (user.accountType !== "BUSINESS_OWNER") return null;
  return <>{children}</>;
}
