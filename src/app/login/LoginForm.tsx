"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, WifiOff } from "lucide-react";
import { db } from "@/lib/db";
import type { Role } from "@/types/roles";
import { startSession } from "@/features/auth/session";
import { useOnlineStatus } from "@/lib/use-online-status";
import { RippleButton } from "@/components/ui/Ripple";
import { GoogleIcon } from "@/components/ui/GoogleIcon";
import { WelcomeIllustration } from "@/components/illustrations/WelcomeIllustration";
import { Skeleton } from "@/components/ui/Skeleton";
import { TextInput } from "@/components/ui/TextInput";
import { loginAction } from "@/app/actions/auth";
import Link from "next/link";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { useScrollToError } from "@/hooks/use-scroll-to-error";

export default function LoginForm({ csrfToken }: { csrfToken: string }) {
  const router = useRouter();
  const isOnline = useOnlineStatus();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  // Error ref for scrolling
  const errorRef = useScrollToError<HTMLDivElement>(error);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const force = params.get("force") === "true";
    if (force) {
      setChecking(false);
      return;
    }
    db.localUsers.toArray().then((users) => {
      if (users.length > 0) {
        router.replace("/unlock");
      } else {
        setChecking(false);
      }
    });
  }, [router]);

  async function handleSignIn() {
    setError(null);
    if (!isOnline) {
      setError("First login needs an internet connection. Daily unlock works offline.");
      return;
    }

    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("email", email);
      formData.append("password", password);
      formData.append("csrf_token", csrfToken);

      const result = await loginAction(formData);

      if (!result.success) {
        setError(result.error || "Incorrect email or password.");
        return;
      }

      if (result.profile) {
        let profileData: any = null;
        // We must fetch the user profile from the DB to seed local db if they are logging in on a new device.
        const supabase = getSupabase();
        if (supabase) {
          const { data: profile } = await supabase
            .from("users")
            .select("id, full_name, role, pin_hash, is_active")
            .eq("id", result.profile.id)
            .single();

          if (profile) {
            profileData = profile;
            await db.localUsers.put({
              id: profile.id,
              fullName: profile.full_name,
              role: profile.role as Role,
              pinHash: profile.pin_hash,
              isActive: profile.is_active,
              updatedAt: new Date().toISOString(),
            });
          }
        }

        await startSession(result.profile.id);
        if (profileData?.role === "super_admin") {
          router.replace("/admin");
        } else {
          router.replace("/unlock");
        }
      }
    } catch {
      setError("Could not sign in. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleSignIn() {
    setError(null);
    if (!isOnline) {
      setError("First login needs an internet connection. Daily unlock works offline.");
      return;
    }
    if (!isSupabaseConfigured()) {
      setError("This device is not connected to a server yet. Ask an admin to finish setup.");
      return;
    }
    const supabase = getSupabase();
    if (!supabase) return;

    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch {
      setError("Could not sign in with Google.");
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-6 px-6 max-w-md mx-auto">
        <Skeleton className="h-20 w-20 rounded-2xl" />
        <div className="flex flex-col gap-3 w-full">
          <Skeleton className="h-5 w-32 mx-auto" />
          <Skeleton className="h-4 w-48 mx-auto" />
        </div>
        <div className="flex flex-col gap-3 w-full mt-4">
          <Skeleton className="h-12 w-full rounded-[var(--radius-control)]" />
          <Skeleton className="h-12 w-full rounded-[var(--radius-control)]" />
        </div>
        <Skeleton className="h-12 w-full rounded-[var(--radius-control)] mt-2" />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col px-6 max-w-md mx-auto overflow-y-auto">
      {/* Error Message - Scroll target at the top */}
      {error && (
        <div
          ref={errorRef}
          role="alert"
          className="rounded-[var(--radius-card)] bg-danger-container px-4 py-3 text-[length:var(--font-size-body)] text-on-danger-container font-medium mt-4 text-center shadow-[var(--shadow-elevation-1)] mx-auto w-full max-w-xs"
        >
          {error}
        </div>
      )}

      {!isOnline && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-[var(--radius-card)] bg-warning-container px-4 py-3 text-[length:var(--font-size-body)] text-on-warning-container mt-4 shrink-0"
        >
          <WifiOff size={16} aria-hidden />
          <span>No connection. First login requires internet. Unlock works offline.</span>
        </div>
      )}

      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center py-8">
        <div
          className="flex h-20 w-20 items-center justify-center rounded-[var(--radius-focus-block)] bg-brand-accent/10 text-brand-accent"
          aria-hidden
        >
          <WelcomeIllustration className="h-14 w-14" />
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-[length:var(--font-size-title-lg)] font-bold tracking-tight text-on-surface">
            Welcome back
          </h1>
          <p className="text-[length:var(--font-size-body)] text-on-surface-muted">
            Sign in to continue managing your store
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 pb-10 shrink-0">
        <RippleButton
          type="button"
          onClick={handleGoogleSignIn}
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

        <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface-container/40 p-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--font-size-label)] font-semibold text-on-surface-muted">
              Email address
            </span>
            <TextInput
              id="login-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="name@domain.com"
              autoComplete="email"
              autoCapitalize="none"
              inputMode="email"
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[length:var(--font-size-label)] font-semibold text-on-surface-muted">
                Password
              </span>
              <Link
                href="/forgot-password"
                className="text-[length:var(--font-size-caption)] font-semibold text-brand-accent hover:opacity-80 transition-opacity no-underline"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <TextInput
                id="login-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
                className="pr-12"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 flex h-[var(--touch-target-min)] w-[var(--touch-target-min)] -translate-y-1/2 items-center justify-center text-on-surface-muted hover:text-on-surface transition-colors duration-[var(--motion-duration-short)]"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
              </button>
            </div>
          </div>
        </div>

        <RippleButton
          id="login-submit"
          type="button"
          onClick={handleSignIn}
          disabled={busy || !email.trim() || !password.trim()}
          className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-brand-accent text-[length:var(--font-size-body-lg)] font-bold text-brand-accent-contrast disabled:opacity-[var(--state-opacity-disabled-content)] hover:opacity-95 transition-opacity duration-[var(--motion-duration-short)] py-3 shadow-[var(--shadow-elevation-1)]"
        >
          {busy ? "Signing in…" : "Sign in"}
        </RippleButton>

        <button
          type="button"
          onClick={() => router.push("/register")}
          className="text-center text-[length:var(--font-size-body)] text-brand-accent font-semibold hover:underline py-1"
        >
          New to StockPadi? Create an account
        </button>
      </div>
    </div>
  );
}
