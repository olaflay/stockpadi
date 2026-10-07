"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, WifiOff } from "lucide-react";
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
import { BackendError, callBackend } from "@/features/auth/backend-client";
import { useScrollToError } from "@/hooks/use-scroll-to-error";
import { GOOGLE_AUTH_ENABLED } from "@/features/auth/auth-config";
import { setLocalBusinessId, withLocalBusinessId, withLocalBusinessIds } from "@/lib/local-tenant";
import { sanitizeString } from "@/lib/sanitize";
import { isPasswordPwned } from "@/lib/pwned-passwords";
import { enqueueOutboxWrite } from "@/features/sync/enqueue-outbox-write";
import { PasswordGuidance, PasswordMatchGuidance } from "@/components/auth/PasswordGuidance";
import { meetsPasswordPolicy } from "@stockpadi/contracts";
import { useAuthFieldVisibility } from "@/hooks/use-auth-field-visibility";

export default function RegisterForm() {
  const router = useRouter();
  const { showToast } = useToast();
  const isOnline = useOnlineStatus();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirmation, setShowPasswordConfirmation] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [confirmationFocused, setConfirmationFocused] = useState(false);
  const [confirmationTouched, setConfirmationTouched] = useState(false);
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const formRegionRef = useRef<HTMLDivElement>(null);
  useAuthFieldVisibility(formRegionRef);

  const errorRef = useScrollToError<HTMLDivElement>(error);

  const formComplete = Boolean(
    fullName.trim() && businessName.trim() && email.trim() && meetsPasswordPolicy(password) &&
    passwordConfirmation && password === passwordConfirmation
  );

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
      setError("Google sign-up didn't work. Check your connection and try again.");
      setBusy(false);
    }
  }

  async function handleSubmit() {
    setConfirmationTouched(true);
    setError(null);
    if (!formComplete) {
      setError("Complete the required fields before continuing.");
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
      if (await isPasswordPwned(password)) {
        setError("This password has appeared in a data breach. Please choose a different one.");
        setBusy(false);
        return;
      }

      const defaultTemplate = BUSINESS_TYPE_TEMPLATES.find((t) => t.id === "general_retail") || BUSINESS_TYPE_TEMPLATES[0];

      const cleanFullName = sanitizeString(fullName);
      const cleanBusinessName = sanitizeString(businessName);
      const cleanEmail = email.trim().toLowerCase();

      const registration = await callBackend<{
        userId: string;
        businessId?: string;
        branch?: { id: string; name: string; isActive?: boolean };
        accountState?: string;
        businessStatus?: string;
        emailVerified?: boolean;
        verificationEmailSent?: boolean;
      }>("register-business", {
        email: cleanEmail,
        password,
        fullName: cleanFullName,
        businessName: cleanBusinessName,
        businessTypeId: defaultTemplate.id,
      });

      // Sign in to establish local session JWT
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (signInError || !signInData.user) {
        setError("Couldn't complete sign-in. If you already have an account, try logging in instead.");
        router.push("/login");
        return;
      }

      const userId = signInData.user.id;
      if (registration.businessId) await setLocalBusinessId(registration.businessId);

      const branchRecord = registration.branch
        ? { id: registration.branch.id, name: registration.branch.name, isActive: true, isPrimary: true }
        : { id: crypto.randomUUID(), name: "Main branch", isActive: true, isPrimary: true };

      // Ensure theme defaults to system theme for the new user
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("stockpadi-theme");
        document.documentElement.removeAttribute("data-theme");
      }

      // Seed local IndexedDB
      await db.transaction("rw", db.businessProfile, db.categories, db.branches, db.localUsers, db.outbox, async () => {
        await db.businessProfile.put({
          id: BUSINESS_PROFILE_SINGLETON_ID,
          businessId: registration.businessId,
          name: cleanBusinessName,
          businessTypeId: defaultTemplate.id,
          currency: "NGN",
        });
        const starterCategories = ["General Goods"];
        const categoryRecords = await withLocalBusinessIds(starterCategories.map((catName) => ({ id: crypto.randomUUID(), name: catName })));
        await db.categories.bulkPut(categoryRecords);
        for (const category of categoryRecords) {
          await enqueueOutboxWrite(category.id, "category", category, new Date().toISOString(), { entityId: category.id });
        }
        await db.branches.put(await withLocalBusinessId(branchRecord));
        await db.localUsers.put({
           id: userId,
           businessId: registration.businessId,
           fullName: cleanFullName,
          accountType: "BUSINESS_OWNER",
          isActive: true,
          emailVerified: registration.emailVerified ?? false,
          businessStatus: registration.businessStatus ?? "pending",
          updatedAt: new Date().toISOString(),
        });
      });

      await startSession(userId);

      showToast(
        registration.verificationEmailSent === false
          ? "Account created, but the verification email could not be delivered. Use Resend code on the next screen."
          : "Account created. Check your email for the verification code.",
        registration.verificationEmailSent === false ? "warning" : "success"
      );
      router.replace(registration.accountState === "REGISTERED_UNVERIFIED" ? "/verify-email" : "/pending-approval");
    } catch (e: unknown) {
      if (e instanceof BackendError) {
        if (e.code === "EMAIL_ALREADY_REGISTERED") {
          setError("An account with this email already exists. Sign in instead.");
        } else if (e.code === "AUTH_VALIDATION_FAILED") {
          setError("Check your email and password, then try again.");
        } else if (e.status && e.status >= 500) {
          setError("We couldn't create the account right now. Check your connection and try again.");
        } else {
          setError("We couldn't create the account. Check your details and try again.");
        }
      } else {
        setError("We couldn't create the account. Check your connection and try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-viewport flex w-full flex-col max-w-md mx-auto">
      <div className="flex shrink-0 flex-col items-center gap-2 px-6 py-6 sm:py-8 text-center">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-[var(--radius-focus-block)] bg-brand-accent/10 text-brand-accent mb-1"
          aria-hidden
        >
          <RegisterIllustration className="h-10 w-10" />
        </div>
        <h1 className="text-[length:var(--font-size-title-lg)] font-bold tracking-tight text-on-surface">
          Create your account
        </h1>
        <p className="text-[length:var(--font-size-body)] text-on-surface-muted">
          Set up in seconds, sell offline forever
        </p>
      </div>

      <div ref={formRegionRef} data-auth-scroll-region className="auth-scroll-region px-6 pt-2 pb-8">
        {!isOnline && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-[var(--radius-card)] bg-warning-container px-4 py-3 text-[length:var(--font-size-body)] text-on-warning-container mt-4"
          >
            <WifiOff size={16} aria-hidden />
            <span>No connection. Initial signup needs internet.</span>
          </div>
        )}

        {error && (
          <div
            ref={errorRef}
            id="register-form-error"
            role="alert"
            className="rounded-[var(--radius-card)] bg-danger-container px-4 py-3 text-[length:var(--font-size-body)] text-on-danger-container font-medium mt-4"
          >
            {error}
          </div>
        )}

        <form
          id="register-form"
          ref={formRef}
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
          className="flex flex-col gap-4 mt-6 pb-2"
        >
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

          <div className="flex flex-col gap-3 rounded-[var(--radius-card)] bg-surface-container-low p-4">
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
                autoCapitalize="words"
                enterKeyHint="next"
                aria-describedby={error ? "register-form-error" : undefined}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[length:var(--font-size-label)] font-semibold text-on-surface-muted">
                Shop name
              </span>
              <TextInput
                id="register-business-name"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Kola Provisions"
                type="text"
                autoCapitalize="words"
                enterKeyHint="next"
                aria-describedby={error ? "register-form-error" : undefined}
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
                placeholder="johnsonaimus@gmail.com"
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                inputMode="email"
                enterKeyHint="next"
                aria-describedby={error ? "register-form-error" : undefined}
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
                  enterKeyHint="next"
                  aria-describedby={error ? "register-password-guidance register-form-error" : "register-password-guidance"}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
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
              <div id="register-password-guidance">
                <PasswordGuidance password={password} active={passwordFocused} />
              </div>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[length:var(--font-size-label)] font-semibold text-on-surface-muted">
                Confirm password
              </span>
              <div className="relative">
                <TextInput
                  id="register-password-confirmation"
                  value={passwordConfirmation}
                  onChange={(e) => setPasswordConfirmation(e.target.value)}
                  className="pr-12"
                  type={showPasswordConfirmation ? "text" : "password"}
                  placeholder="Enter it again"
                  autoComplete="new-password"
                  enterKeyHint="done"
                  hasError={confirmationTouched && passwordConfirmation.length >= 3 && password.length >= 3 && password !== passwordConfirmation}
                  errorId="register-password-match"
                  onFocus={() => setConfirmationFocused(true)}
                  onBlur={() => {
                    setConfirmationFocused(false);
                    setConfirmationTouched(true);
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPasswordConfirmation((v) => !v)}
                  className="absolute right-3 top-1/2 flex h-[var(--touch-target-min)] w-[var(--touch-target-min)] -translate-y-1/2 items-center justify-center text-on-surface-muted hover:text-on-surface transition-colors duration-[var(--motion-duration-short)]"
                  aria-label={showPasswordConfirmation ? "Hide password" : "Show password"}
                >
                  {showPasswordConfirmation ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
                </button>
              </div>
              <div id="register-password-match">
                <PasswordMatchGuidance password={password} confirmation={passwordConfirmation} active={confirmationFocused || confirmationTouched} />
              </div>
            </label>
          </div>
          <RippleButton
            id="register-submit"
            type="submit"
            disabled={busy}
            className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-brand-accent text-[length:var(--font-size-body-lg)] font-bold text-brand-accent-contrast disabled:opacity-[var(--state-opacity-disabled-content)] hover:opacity-95 transition-opacity duration-[var(--motion-duration-short)] py-3 shadow-[var(--shadow-elevation-1)]"
          >
            {busy ? "Creating account…" : "Create account"}
          </RippleButton>

          <button
            type="button"
            onClick={() => router.push("/login")}
            className="text-center text-[length:var(--font-size-body)] text-brand-accent font-semibold hover:underline min-h-[var(--touch-target-min)] flex items-center justify-center"
          >
            Already have an account? Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
