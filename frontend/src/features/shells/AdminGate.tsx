"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { Skeleton } from "@/components/ui/Skeleton";

export function AdminGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useCurrentUser();

  useEffect(() => {
    if (user.accountType !== "ADMIN") {
      router.replace(user.accountType === "BUSINESS_OWNER" ? "/business" : "/work");
    }
  }, [router, user.accountType]);

  if (user.accountType !== "ADMIN") return <Skeleton className="m-6 h-48" />;
  return <>{children}</>;
}
