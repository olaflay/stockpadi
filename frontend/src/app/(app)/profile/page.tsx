"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { UserCircle, LogOut } from "lucide-react";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { signOut } from "@/features/auth/logout";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { getSupabase } from "@/lib/supabase";

const ACCOUNT_LABELS = {
  ADMIN: "Platform Admin",
  BUSINESS_OWNER: "Business Owner",
  WORKER: "Worker",
} as const;

export default function ProfilePage() {
  const router = useRouter();
  const user = useCurrentUser();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getSupabase()?.auth.getUser().then(({ data }) => {
      if (active) setEmail(data.user?.email ?? null);
    });
    return () => { active = false; };
  }, []);

  async function handleLogout() {
    await signOut();
    router.replace("/login?force=true");
  }

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader title="Profile" onBack={() => router.push("/settings")} />
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-accent/10">
          <UserCircle size={40} className="text-brand-accent" aria-hidden />
        </div>
        <div>
          <p className="text-[length:var(--font-size-title-lg)] font-semibold text-on-surface">{user.fullName}</p>
          <p className="text-[length:var(--font-size-body)] text-on-surface-muted">
            {ACCOUNT_LABELS[user.accountType ?? "WORKER"]}
          </p>
          {email && <p className="mt-1 text-[length:var(--font-size-caption)] text-on-surface-muted">{email}</p>}
        </div>
      </div>
      <section className="rounded-[var(--radius-card)] border border-border bg-surface-container/40 p-4">
        <p className="text-[length:var(--font-size-body)] text-on-surface">
          {user.accountType === "WORKER" ? "Sign in with your email and password through the normal login screen. Password resets are handled by your Business Owner." : "Sign in with your email and password through the normal login screen. Password changes are available through Forgot password."}
        </p>
      </section>
      <button
        type="button"
        onClick={handleLogout}
        className="flex min-h-[var(--touch-target-min)] items-center justify-center gap-2 rounded-[var(--radius-control)] border border-danger px-4 text-[length:var(--font-size-body)] font-medium text-danger hover:bg-danger-container transition-colors"
      >
        <LogOut size={18} aria-hidden />
        Log out
      </button>
    </div>
  );
}
