"use client";

import { useCurrentUser } from "@/features/auth/use-current-user";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Explicit Worker route boundary around reusable domain screens. */
export function WorkerRoute({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser();
  const router = useRouter();

  useEffect(() => {
    if (user.accountType === "ADMIN") router.replace("/admin");
    if (user.accountType === "BUSINESS_OWNER") router.replace("/business");
  }, [router, user.accountType]);

  if (user.accountType !== "WORKER") return null;
  return <>{children}</>;
}
