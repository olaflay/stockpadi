"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { db, BUSINESS_PROFILE_SINGLETON_ID, SESSION_SINGLETON_ID } from "@/lib/db";
import { removeLegacyTestUser } from "@/features/auth/legacy-cleanup";

/** Routes into onboarding or straight to the dashboard based on local state, no network round trip. */
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    async function determineRoute() {
      await removeLegacyTestUser();
      const session = await db.session.get(SESSION_SINGLETON_ID);
      if (session && new Date(session.expiresAt).getTime() > Date.now()) {
        const user = await db.localUsers.get(session.userId);
        const accountType = user?.accountType ?? null;
        if (accountType === "ADMIN") {
          router.replace("/admin");
          return;
        }
        const profile = await db.businessProfile.get(BUSINESS_PROFILE_SINGLETON_ID);
        router.replace(profile ? (accountType === "BUSINESS_OWNER" ? "/business" : "/work") : "/onboarding");
        return;
      }
      // No active local session: use the single normal login route.
      router.replace("/login?force=true");
    }
    determineRoute();
  }, [router]);

  return null;
}
