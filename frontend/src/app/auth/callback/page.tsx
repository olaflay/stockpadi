"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { db } from "@/lib/db";
import { startSession } from "@/features/auth/session";
import { Skeleton } from "@/components/ui/Skeleton";
import { callBackend } from "@/features/auth/backend-client";

/**
 * Landing point for "Continue with Google" from the login screen.
 * Must be a client page, not a server route: the rest of the app reads its
 * Supabase session from the browser client's localStorage (see lib/supabase.ts),
 * while a server route can only exchange the OAuth code into a cookie-based
 * session the browser client never sees. Letting the client SDK's own
 * detectSessionInUrl pick up the code here keeps both in the same store.
 */
export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      router.replace("/login?error=auth_callback_failed");
      return;
    }

    supabase.auth.getUser().then(async ({ data, error }) => {
      if (error || !data.user) {
        router.replace("/login?error=auth_callback_failed");
        return;
      }

      type Profile = { id: string; full_name: string; role: string; is_active: boolean; account_type?: "ADMIN" | "BUSINESS_OWNER" | "WORKER" };
      let profile: Profile | null = null;
      let permissions: string[] = [];
      let branchIds: string[] = [];
      let businessId: string | undefined;
      try { const context = await callBackend<{ profile: Profile; permissions?: string[]; branchIds?: string[]; businessId?: string }>("account-context", {}); profile = context.profile; permissions = context.permissions ?? []; branchIds = context.branchIds ?? []; businessId = context.businessId; } catch { profile = null; }

      if (!profile || !profile.is_active) {
        // Authenticated with Google but no StockPadi account exists for
        // this email — send them to create one instead of stranding them.
        await supabase.auth.signOut().catch(() => {});
        router.replace("/register?error=no_account");
        return;
      }

      await db.localUsers.put({
        id: profile.id,
        fullName: profile.full_name,
        accountType: profile.account_type ?? "WORKER",
        permissions,
        businessId,
        branchIds,
        isActive: profile.is_active,
        updatedAt: new Date().toISOString(),
      });
      await startSession(profile.id);
      router.replace(profile.account_type === "ADMIN" ? "/admin" : profile.account_type === "WORKER" ? "/work" : "/business");
    });
  }, [router]);

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-4 px-6 max-w-md mx-auto">
      <Skeleton className="h-16 w-16 rounded-2xl" />
      <Skeleton className="h-4 w-48" />
    </div>
  );
}
