"use client";

import { useCurrentUserOptional } from "@/features/auth/use-current-user";

export function BannerStrip() {
  const user = useCurrentUserOptional();
  if (user?.accountType !== "BUSINESS_OWNER" || !user.businessStatus ||
      user.businessStatus === "verified" || user.businessStatus === "active") return null;

  return (
    <div className="bg-warning-container px-gutter py-1 text-center text-[length:var(--font-size-caption)] leading-tight text-on-warning-container">
      Store setup is waiting for approval
    </div>
  );
}
