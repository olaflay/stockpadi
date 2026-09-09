"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/features/auth/use-current-user";

/** Directs platform admins to /admin; permits both business owners and workers into the app shell. */
export function LegacyShellGuard({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser();
  const router = useRouter();

  useEffect(() => {
    if (user.accountType === "ADMIN") router.replace("/admin");
  }, [router, user.accountType]);

  if (user.accountType === "ADMIN") return null;
  return <>{children}</>;
}
