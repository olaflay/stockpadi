"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, WifiOff, Store, Package, Pill, Cpu } from "lucide-react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { db, BUSINESS_PROFILE_SINGLETON_ID } from "@/lib/db";
import { BUSINESS_TYPE_TEMPLATES } from "@/config/business-types";
import { startSession } from "@/features/auth/session";
import { useOnlineStatus } from "@/lib/use-online-status";
import { useToast } from "@/components/ui/Toast";
import { RippleButton } from "@/components/ui/Ripple";
import { GoogleIcon } from "@/components/ui/GoogleIcon";
import { RegisterIllustration } from "@/components/illustrations/RegisterIllustration";
import { TextInput } from "@/components/ui/TextInput";
import type { Role } from "@/types/roles";
import { callBackend } from "@/features/auth/backend-client";
import { sendVerificationEmail } from "@/features/auth/verification-client";
import { useScrollToError } from "@/hooks/use-scroll-to-error";
import { GOOGLE_AUTH_ENABLED } from "@/features/auth/auth-config";
import { setLocalBusinessId } from "@/lib/local-tenant";

const BUSINESS_TYPE_ICONS: Record<string, React.ElementType> = {
  grocery_supermarket: Store,
  pharmacy_fmcg: Pill,
  electronics_accessories: Cpu,
  general_retail: Package,
};

export default function RegisterForm() {
  const router = useRouter();
  const { showToast } = useToast();
  const isOnline = useOnlineStatus();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [selectedBusinessTypeId, setSelectedBusinessTypeId] = useState(BUSINESS_TYPE_TEMPLATES[0].id);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hydrated = typeof window !== "undefined";

  const errorRef = useScrollToError<HTMLDivElement>(error);

  const formComplete = Boolean(
    fullName.trim() && businessName.trim() && email.trim() && password.trim().length >= 8
  );

  // Only flag once both fields are fully entered — not while still typing.

  async function handleGoogleSignUp() {
    setError(null);
    if (!isOnline) {
      setError("Creating an account needs an internet connection.");
      return;
    }
    if (!isSupabaseConfigured()) {
      setError("Server is not configured yet. Contact an admin.");
      return;
    }
    const supabase = getSupabase();
    if (!supabase) return;

    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/register/callback`,
        },
      });
      if (error) throw error;
    } catch {
      setError("Could not register with Google.");
      setBusy(false);
    }
  }

  async function handleSubmit() {
    setError(null);
    if (!formComplete) {
      setError("Fill out every field before continuing — password needs at least 8 characters.");
      return;
    }
    if (!isOnline) {
      setError("Creating an account needs an internet connection.");
      return;
    }
    const supabase = getSupabase();
    if (!supabase) return;

    setBusy(true);
    try {
      // Account creation is handled by the trusted registration Edge Function.
      const registration = await callBackend<{ userId: string; businessId?: string }>("register-business", {
        email,
        password,
        fullName,
        businessName,
        businessTypeId: selectedBusinessTypeId,
      });

      // createAccountAction returns success:true with no userId when the
      // email is already registered (idempotency, not a fresh account) —
      // signing in with the just-typed password would legitimately fail
      // and surface as a confusing "wrong password" error mid-signup.

      // 2. Sign in to establish local session JWT
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError || !signInData.user) {
        // Deliberately generic — doesn't confirm whether an account already
        // existed at this email, matching the vague-error pattern used for
        // login/forgot-password. See the enumeration finding this closes.
        setError("Couldn't complete sign-in. If you already have an account, try logging in instead.");
        router.push("/login");
        return;
      }

      const userId = signInData.user.id;
      const template = BUSINESS_TYPE_TEMPLATES.find((t) => t.id === selectedBusinessTypeId)!;

      // 3. Seed local IndexedDB
      await db.transaction("rw", db.businessProfile, db.categories, db.branches, db.localUsers, async () => {
        await db.businessProfile.put({
          id: BUSINESS_PROFILE_SINGLETON_ID,
          businessId: registration.businessId,
          name: businessName.trim(),
          businessTypeId: template.id,
          currency: "NGN",
        });
        await db.categories.bulkPut(
          template.defaultCategories.map((catName) => ({ id: crypto.randomUUID(), name: catName }))
        );
        await db.branches.add({ id: crypto.randomUUID(), name: "Main branch", isActive: true });
        await db.localUsers.put({
          id: userId,
          fullName: fullName.trim(),
          role: "owner" as Role,
          accountType: "BUSINESS_OWNER",
          isActive: true,
          emailVerified: false,
          updatedAt: new Date().toISOString(),
        });
      });
      if (registration.businessId) await setLocalBusinessId(registration.businessId);

      // 4. Start local session so Edge Functions can be called with a valid token
      await startSession(userId);

      const verification = await sendVerificationEmail();
      if (!verification.ok) {
        showToast("Account created, but the verification email could not be sent. Use Resend from the app.", "warning");
      }

      if (verification.ok) showToast("Business account created. Check your email for the verification code.", "success");
      router.replace("/business");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-screen w-full flex-col max-w-md mx-auto overflow-hidden">
      <div className="flex flex-col items-center gap-3 px-6 pt-10 text-center shrink-0">
        <div
          className="flex h-18 w-18 items-center justify-center rounded-[var(--radius-focus-block)] bg-brand-accent/10 text-brand-accent"
          aria-hidden
        >
          <RegisterIllustration className="h-12 w-12" />
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-[length:var(--font-size-title-lg)] font-bold tracking-tight text-on-surface">
            Create your store
          </h1>
          <p className="text-[length:var(--font-size-body)] text-on-surface-muted">
            Set up once and start recording sales right away
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-4">
        {!isOnline && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-[var(--radius-card)] bg-warning-container px-4 py-3 text-[length:var(--font-size-body)] text-on-warning-container mt-5"
          >
            <WifiOff size={16} aria-hidden />
            <span>No connection. Creating an account requires internet.</span>
          </div>
        )}

        {error && (
          <div
            ref={errorRef}
            role="alert"
            className="rounded-[var(--radius-card)] bg-danger-container px-4 py-3 text-[length:var(--font-size-body)] text-on-danger-container font-medium mt-5"
          >
            {error}
          </div>
        )}

        <div className="flex flex-col gap-4 mt-5">
          {GOOGLE_AUTH_ENABLED && (
            <>
              <RippleButton
                type="button"
                onClick={handleGoogleSignUp}
                disabled={busy}
                className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] border border-border bg-surface text-[length:var(--font-size-body-lg)] font-bold text-on-surface hover:bg-surface-container-high transition-colors duration-[var(--motion-duration-short)] py-3 shadow-[var(--shadow-elevation-1)] flex items-center justify-center gap-3"
              >
                <GoogleIcon />
                Continue with Google
              </RippleButton>

              <div className="flex items-center gap-3 w-full opacity-60">
                <hr className="flex-1 border-border" />
                <span className="text-[length:var(--font-size-caption)] font-medium text-on-surface-muted uppercase">or</span>
                <hr className="flex-1 border-border" />
              </div>
            </>
          )}

          <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface-container/40 p-4">
            <p className="text-[length:var(--font-size-label)] font-semibold text-on-surface-muted uppercase tracking-wide">
              Your details
            </p>

            <label className="flex flex-col gap-1.5">
              <span className="text-[length:var(--font-size-label)] font-semibold text-on-surface-muted">
                Full name
              </span>
              <TextInput
                id="register-full-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Kola Alao"
                type="text"
                autoComplete="name"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[length:var(--font-size-label)] font-semibold text-on-surface-muted">
                Email address
              </span>
              <TextInput
                id="register-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@domain.com"
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                inputMode="email"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[length:var(--font-size-label)] font-semibold text-on-surface-muted">
                Password
              </span>
              <div className="relative">
                <TextInput
                  id="register-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-12"
                  type={showPassword ? "text" : "password"}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 flex h-[var(--touch-target-min)] w-[var(--touch-target-min)] items-center justify-center text-on-surface-muted hover:text-on-surface transition-colors duration-[var(--motion-duration-short)]"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
                </button>
              </div>
            </label>
          </div>

          <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface-container/40 p-4">
            <p className="text-[length:var(--font-size-label)] font-semibold text-on-surface-muted uppercase tracking-wide">
              Store details
            </p>

            <label className="flex flex-col gap-1.5">
              <span className="text-[length:var(--font-size-label)] font-semibold text-on-surface-muted">
                Store name
              </span>
              <TextInput
                id="register-business-name"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Kola Provisions"
                type="text"
              />
            </label>

            <div className="flex flex-col gap-2">
              <span className="text-[length:var(--font-size-label)] font-semibold text-on-surface-muted">
                Business type
              </span>
              <div className="grid grid-cols-2 gap-2">
                {BUSINESS_TYPE_TEMPLATES.map((template) => {
                  const Icon = BUSINESS_TYPE_ICONS[template.id] ?? Store;
                  const isSelected = selectedBusinessTypeId === template.id;
                  return (
                    <button
                      key={template.id}
                      id={`biz-type-${template.id}`}
                      type="button"
                      onClick={() => setSelectedBusinessTypeId(template.id)}
                      aria-pressed={isSelected}
                      className={`flex min-h-[var(--touch-target-min)] flex-col items-start gap-1 rounded-[var(--radius-card)] border-2 px-3 py-2.5 text-left transition-colors duration-[var(--motion-duration-short)] ${
                        isSelected
                          ? "border-brand-accent bg-brand-accent/8 text-brand-accent"
                          : "border-border bg-surface-container text-on-surface hover:bg-surface-container-high"
                      }`}
                    >
                      <Icon size={18} aria-hidden />
                      <span className="text-[length:var(--font-size-body)] font-semibold leading-tight">
                        {template.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-border px-6 py-4 shrink-0">
        <RippleButton
          id="register-submit"
          type="button"
          onClick={handleSubmit}
          disabled={!hydrated || busy || !formComplete}
          className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-brand-accent text-[length:var(--font-size-body-lg)] font-bold text-brand-accent-contrast disabled:opacity-[var(--state-opacity-disabled-content)] hover:opacity-95 transition-opacity duration-[var(--motion-duration-short)] py-3 shadow-[var(--shadow-elevation-1)]"
        >
          {busy ? "Creating account..." : "Create Account"}
        </RippleButton>

        <button
          type="button"
          onClick={() => router.push("/login")}
          className="text-center text-[length:var(--font-size-body)] text-brand-accent font-semibold hover:underline"
        >
          Already have an account? Sign in
        </button>
      </div>
    </div>
  );
}
