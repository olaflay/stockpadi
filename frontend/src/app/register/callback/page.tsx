"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { db, BUSINESS_PROFILE_SINGLETON_ID } from "@/lib/db";
import { BUSINESS_TYPE_TEMPLATES } from "@/config/business-types";
import { startSession } from "@/features/auth/session";
import { useToast } from "@/components/ui/Toast";
import { RippleButton } from "@/components/ui/Ripple";
import { RegisterIllustration } from "@/components/illustrations/RegisterIllustration";
import { TextInput } from "@/components/ui/TextInput";
import { callBackend } from "@/features/auth/backend-client";
import { Skeleton } from "@/components/ui/Skeleton";
import { setLocalBusinessId, withLocalBusinessId, withLocalBusinessIds } from "@/lib/local-tenant";

export default function RegisterCallbackPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [businessName, setBusinessName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    void supabase.auth.getUser().then(async ({ data, error: authError }) => {
      if (authError || !data.user) {
        router.replace("/register");
        return;
      }
      try {
        const context = await callBackend<{ profile: { id: string; full_name: string; role: string; account_type: "ADMIN" | "BUSINESS_OWNER" | "WORKER"; is_active: boolean }; permissions?: string[]; branchIds?: string[]; businessId?: string }>("account-context", {});
        const profile = context.profile;
        await db.localUsers.put({ id: profile.id, businessId: context.businessId, branchIds: context.branchIds ?? [], fullName: profile.full_name, accountType: profile.account_type, permissions: context.permissions ?? [], isActive: profile.is_active, updatedAt: new Date().toISOString() });
        await startSession(profile.id);
        router.replace(profile.account_type === "ADMIN" ? "/admin" : profile.account_type === "WORKER" ? "/work" : "/business");
        return;
      } catch {
        setLoading(false);
      }
    });
  }, [router]);

  async function finishSetup() {
    setError(null);
    if (!businessName.trim()) {
      setError("Enter your shop name.");
      return;
    }
    setBusy(true);
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error("Server is not configured.");
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error("Your sign-in session has expired.");
      
      const defaultTemplate = BUSINESS_TYPE_TEMPLATES.find((t) => t.id === "general_retail") || BUSINESS_TYPE_TEMPLATES[0];
      const registration = await callBackend<{ businessId?: string }>("register-business", {
        action: "complete_oauth",
        businessName: businessName.trim(),
        businessTypeId: defaultTemplate.id,
      });

      if (registration.businessId) await setLocalBusinessId(registration.businessId);

      await db.transaction("rw", db.businessProfile, db.categories, db.branches, db.localUsers, async () => {
        await db.businessProfile.put({
          id: BUSINESS_PROFILE_SINGLETON_ID,
          name: businessName.trim(),
          businessTypeId: defaultTemplate.id,
          currency: "NGN",
        });
        await db.categories.bulkPut(
          await withLocalBusinessIds(defaultTemplate.defaultCategories.map((name) => ({ id: crypto.randomUUID(), name })))
        );
        await db.branches.add(await withLocalBusinessId({ id: crypto.randomUUID(), name: "Main branch", isActive: true }));
        await db.localUsers.put({
          id: authData.user.id,
          fullName: authData.user.user_metadata?.full_name ?? authData.user.email?.split("@")[0] ?? "Owner",
          accountType: "BUSINESS_OWNER",
          isActive: true,
          emailVerified: true,
          updatedAt: new Date().toISOString(),
        });
      });

      await startSession(authData.user.id);
      showToast("Shop account created.", "success");
      router.replace("/business");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finish registration.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Skeleton className="h-10 w-10 rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full max-w-md mx-auto flex-col overflow-hidden">
      <div className="flex flex-col items-center gap-3 px-6 pt-10 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-[var(--radius-focus-block)] bg-brand-accent/10 text-brand-accent">
          <RegisterIllustration className="h-10 w-10" />
        </div>
        <h1 className="text-[length:var(--font-size-title-lg)] font-bold tracking-tight text-on-surface">
          Name your shop
        </h1>
        <p className="text-[length:var(--font-size-body)] text-on-surface-muted">
          Enter your shop name to finish signing up.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-8">
        {error && (
          <div role="alert" className="mt-5 rounded-[var(--radius-card)] bg-danger-container px-4 py-3 text-on-danger-container">
            {error}
          </div>
        )}
        <div className="mt-5 flex flex-col gap-4 rounded-[var(--radius-card)] border border-border bg-surface-container/40 p-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--font-size-label)] font-semibold text-on-surface-muted">
              Shop name
            </span>
            <TextInput
              value={businessName}
              onChange={(event) => setBusinessName(event.target.value)}
              placeholder="e.g. Kola Provisions"
              autoFocus
            />
          </label>
        </div>
      </div>

      <div className="border-t border-border px-6 py-4">
        <RippleButton
          type="button"
          onClick={finishSetup}
          disabled={busy || !businessName.trim()}
          className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-brand-accent py-3 text-[length:var(--font-size-body-lg)] font-bold text-brand-accent-contrast disabled:opacity-50"
        >
          {busy ? "Creating shop..." : "Finish & Continue"}
        </RippleButton>
      </div>
    </div>
  );
}
