"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { db, BUSINESS_PROFILE_SINGLETON_ID, SESSION_SINGLETON_ID } from "@/lib/db";
import { AUTH_DISABLED, ensureDevBypassSession } from "@/features/auth/dev-auth-bypass";

/** Routes into onboarding or straight to the dashboard based on local state, no network round trip. */
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    async function determineRoute() {
      if (AUTH_DISABLED) {
        await ensureDevBypassSession();
        router.replace("/sales");
        return;
      }
      const session = await db.session.get(SESSION_SINGLETON_ID);
      if (session && new Date(session.expiresAt).getTime() > Date.now()) {
        const user = await db.localUsers.get(session.userId);
        if (user && user.role === "super_admin") {
          router.replace("/admin");
          return;
        }
        const profile = await db.businessProfile.get(BUSINESS_PROFILE_SINGLETON_ID);
        router.replace(profile ? "/sales" : "/onboarding");
        return;
      }
      // No active session: a device that already has a local account should
      // only need a quick PIN unlock, never the full create-account screen.
      const users = await db.localUsers.toArray();
      router.replace(users.length > 0 ? "/unlock" : "/register");
    }
    determineRoute();
  }, [router]);

  return null;
}
