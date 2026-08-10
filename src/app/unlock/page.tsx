"use client";

/**
 * Lead system: Samsung One UI (one-handed, bottom-interaction layout).
 * Two states rendered from a single component:
 *   1. User picker — viewing area shows brand identity; bottom area lists
 *      users as tappable cards within comfortable thumb reach.
 *   2. PIN entry — viewing area shows selected user identity; bottom area
 *      holds the PIN input and Unlock CTA within thumb reach.
 * Loading state: a layout-matching skeleton while IndexedDB hydrates.
 * Empty state: redirect to /login (no local users means first-time device).
 * PIN auto-submit at length 4 — removes friction for the primary action.
 * PIN session expires after 24 hours (see session.ts).
 * See .agents/rules/design-system.md and zero-ai-slop-design.md.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { LockKeyhole, Eye, EyeOff, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { verifyPin } from "@/lib/pin-hash";
import { startSession } from "@/features/auth/session";
import { Skeleton } from "@/components/ui/Skeleton";
import { RippleButton } from "@/components/ui/Ripple";
import { TextInput } from "@/components/ui/TextInput";
import { useScrollToError } from "@/hooks/use-scroll-to-error";

// Escalating lockout after repeated wrong PINs — a 4-digit PIN is only
// 10,000 combinations and the local PBKDF2 check costs single-digit
// milliseconds, so an unattended shared device would otherwise be
// guessable in minutes with no server involved at all.
const LOCKOUT_SCHEDULE: Array<{ afterAttempts: number; lockSeconds: number }> = [
  { afterAttempts: 3, lockSeconds: 15 },
  { afterAttempts: 5, lockSeconds: 60 },
  { afterAttempts: 7, lockSeconds: 300 },
  { afterAttempts: 10, lockSeconds: 900 },
];
const FORCE_RELOGIN_AFTER_ATTEMPTS = 10;

export default function UnlockPage() {
  const router = useRouter();
  const users = useLiveQuery(() => db.localUsers.toArray(), []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const errorRef = useScrollToError<HTMLDivElement>(error);

  const activeUsers = users?.filter((u) => u.isActive) ?? [];
  // Auto-select when there is exactly one user — no unnecessary picker step.
  const effectiveSelectedId = selectedId ?? (activeUsers.length === 1 ? activeUsers[0].id : null);
  const selectedUser = activeUsers.find((u) => u.id === effectiveSelectedId);

  const lockedUntilMs = selectedUser?.pinLockedUntil ? new Date(selectedUser.pinLockedUntil).getTime() : null;
  const isLocked = lockedUntilMs !== null && lockedUntilMs > now;
  const lockRemainingSeconds = isLocked ? Math.ceil((lockedUntilMs! - now) / 1000) : 0;

  // Tick every second while locked so the countdown and re-enabled state
  // update live without requiring a retry tap.
  useEffect(() => {
    if (!isLocked) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isLocked]);

  async function handleUnlock() {
    if (!effectiveSelectedId) return;
    setError(null);
    const user = activeUsers.find((u) => u.id === effectiveSelectedId);
    if (!user) return;

    if (user.pinLockedUntil && new Date(user.pinLockedUntil).getTime() > Date.now()) {
      setError(`Too many attempts. Try again in ${lockRemainingSeconds}s.`);
      setPin("");
      return;
    }

    setBusy(true);
    try {
      const ok = await verifyPin(pin, user.pinHash);
      if (!ok) {
        const attempts = (user.failedPinAttempts ?? 0) + 1;
        const tier = [...LOCKOUT_SCHEDULE].reverse().find((t) => attempts >= t.afterAttempts);
        const lockedUntil = tier ? new Date(Date.now() + tier.lockSeconds * 1000).toISOString() : null;
        await db.localUsers.update(user.id, { failedPinAttempts: attempts, pinLockedUntil: lockedUntil });

        if (attempts >= FORCE_RELOGIN_AFTER_ATTEMPTS) {
          setError("Too many incorrect attempts. Sign in with your password to continue.");
          setPin("");
          setTimeout(() => router.replace("/login"), 1500);
          return;
        }

        setError(tier ? `Incorrect PIN. Locked for ${tier.lockSeconds}s.` : "Incorrect PIN. Try again.");
        setPin("");
        return;
      }
      await db.localUsers.update(user.id, { failedPinAttempts: 0, pinLockedUntil: null });
      await startSession(user.id);
      router.replace("/sales");
    } finally {
      setBusy(false);
    }
  }

  // Empty state: if IndexedDB has resolved and there are no active users,
  // this is a fresh device — redirect to /login for full authentication.
  useEffect(() => {
    if (users !== undefined && activeUsers.length === 0) {
      router.replace("/login");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users]);

  // Auto-submit when the user has typed all 4 digits, removing the extra tap.
  useEffect(() => {
    if (pin.length === 4 && effectiveSelectedId && !busy && !isLocked) {
      queueMicrotask(() => {
        handleUnlock();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  function getInitials(name: string): string {
    return name
      .split(" ")
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  }

  // Role display: maps internal role identifiers to human-readable labels.
  function getRoleLabel(role: string): string {
    const labels: Record<string, string> = {
      owner: "Owner",
      admin: "Admin",
      manager: "Manager",
      cashier: "Cashier",
      inventory_staff: "Inventory",
      accountant: "Accountant",
    };
    return labels[role] ?? role;
  }

  // Role badge: tonal color pairs from the token system, never hardcoded hex.
  function getRoleBadgeClass(role: string): string {
    switch (role) {
      case "owner":
      case "admin":
        return "bg-brand-accent/10 text-brand-accent";
      case "manager":
        return "bg-warning-container text-on-warning-container";
      case "cashier":
        return "bg-surface-container-high text-on-surface";
      default:
        return "bg-surface-container text-on-surface-muted";
    }
  }

  // Loading state: skeleton mirrors the actual layout so there is no
  // jarring shift when IndexedDB resolves. Uses the same px-6 horizontal
  // rhythm as the loaded state.
  if (users === undefined) {
    return (
      <div className="flex h-screen w-full flex-col px-6 max-w-md mx-auto">
        <div className="flex flex-col items-center gap-4 pt-12 text-center">
          <Skeleton className="h-16 w-16 rounded-[var(--radius-focus-block)]" />
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-52" />
        </div>
        <div className="flex flex-1 flex-col justify-center gap-3">
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl opacity-60" />
        </div>
        <div className="pb-10">
          <Skeleton className="h-4 w-40 mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col px-6 max-w-md mx-auto">
      {/* Top viewing area: brand/user identity */}
      <div className="flex flex-col items-center gap-3 pt-12 text-center shrink-0">
        {/* Focus block — draws the eye to the one thing that matters */}
        <div className="flex h-16 w-16 items-center justify-center rounded-[var(--radius-focus-block)] bg-brand-accent/10 text-brand-accent">
          {selectedUser ? (
            <span className="text-[length:var(--font-size-title)] font-bold">
              {getInitials(selectedUser.fullName)}
            </span>
          ) : (
            <LockKeyhole size={28} aria-hidden />
          )}
        </div>
        <h1 className="text-[length:var(--font-size-title-lg)] font-bold tracking-tight text-on-surface">
          {selectedUser ? `Welcome back, ${selectedUser.fullName.split(" ")[0]}` : "Who is using this?"}
        </h1>
        <p className="text-[length:var(--font-size-body)] text-on-surface-muted">
          {selectedUser
            ? "Enter your 4-digit PIN to unlock"
            : "Select your profile to access the register"}
        </p>
      </div>

      {/* Bottom interaction area: user list or PIN entry */}
      <div className="flex flex-1 flex-col justify-center gap-4 py-6">
        {!selectedUser ? (
          /* User picker — each card is a full touch target */
          <div className="flex flex-col gap-2 max-h-[52vh] overflow-y-auto">
            {activeUsers.map((user) => (
              <RippleButton
                key={user.id}
                type="button"
                onClick={() => setSelectedId(user.id)}
                className="flex items-center gap-4 min-h-[var(--touch-target-min)] rounded-[var(--radius-card)] border border-border bg-surface px-4 py-3 text-left hover:border-brand-accent hover:bg-brand-accent/5 transition-colors duration-[var(--motion-duration-short)] outline-none w-full"
              >
                {/* Avatar initial */}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-brand-accent text-brand-accent-contrast font-bold text-[length:var(--font-size-body-lg)]">
                  {getInitials(user.fullName)}
                </div>
                {/* Name + role */}
                <div className="flex flex-1 flex-col min-w-0">
                  <span className="font-semibold text-[length:var(--font-size-body-lg)] text-on-surface truncate">
                    {user.fullName}
                  </span>
                  <span
                    className={`self-start text-[length:var(--font-size-caption)] px-2 py-0.5 rounded-[var(--radius-inline)] mt-0.5 font-medium ${getRoleBadgeClass(user.role)}`}
                  >
                    {getRoleLabel(user.role)}
                  </span>
                </div>
                <ChevronRight size={18} className="text-on-surface-muted shrink-0" aria-hidden />
              </RippleButton>
            ))}
          </div>
        ) : (
          /* PIN entry state */
          <div className="flex flex-col gap-4 rounded-[var(--radius-focus-block)] border border-border/60 bg-surface-container/40 p-5">
            {/* Null-PIN guard: owner hasn't set a PIN for this user yet */}
            {!selectedUser.pinHash ? (
              <div className="flex flex-col gap-3 items-center text-center py-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-control)] bg-warning-container text-on-warning-container">
                  <LockKeyhole size={22} aria-hidden />
                </div>
                <div className="flex flex-col gap-1">
                  <p className="font-semibold text-[length:var(--font-size-body-lg)] text-on-surface">
                    No PIN set
                  </p>
                  <p className="text-[length:var(--font-size-body)] text-on-surface-muted">
                    {selectedUser.role === "owner"
                      ? "Complete your setup by setting a PIN in Settings."
                      : "Ask the store owner to set a PIN for your account in Settings."}
                  </p>
                </div>
                {selectedUser.role === "owner" && (
                  <button
                    type="button"
                    onClick={() => router.push("/settings/staff")}
                    className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-brand-accent px-4 text-[length:var(--font-size-body)] font-bold text-brand-accent-contrast hover:opacity-95 transition-opacity duration-[var(--motion-duration-short)] py-2"
                  >
                    Go to Settings
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setSelectedId(null); setError(null); }}
                  className="text-[length:var(--font-size-body)] text-brand-accent font-semibold hover:underline"
                >
                  Choose a different user
                </button>
              </div>
            ) : (
              <>
                {(error || isLocked) && (
                  <div
                    ref={errorRef}
                    role="alert"
                    className="rounded-[var(--radius-card)] bg-danger-container px-4 py-3 text-center text-[length:var(--font-size-body)] text-on-danger-container font-medium"
                  >
                    {error ?? `Too many attempts. Try again in ${lockRemainingSeconds}s.`}
                  </div>
                )}

                {/* PIN input — centered, premium dots/dashes indicator */}
                <div className="relative mb-2">
                  <input
                    id="pin-input"
                    type="tel"
                    pattern="[0-9]*"
                    inputMode="numeric"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    maxLength={4}
                    className="absolute inset-0 h-full w-full opacity-0 cursor-text z-20"
                    autoFocus
                    disabled={isLocked}
                    aria-label="4-digit PIN"
                  />
                  <div 
                    className="flex justify-center gap-4 py-2 cursor-text relative z-10"
                    onClick={() => document.getElementById("pin-input")?.focus()}
                  >
                    {[0, 1, 2, 3].map((index) => {
                      const hasChar = pin.length > index;
                      return (
                        <div
                          key={index}
                          className={`flex h-14 w-14 items-center justify-center rounded-[var(--radius-control)] border-2 text-[length:var(--font-size-title)] font-bold transition-all duration-[var(--motion-duration-short)] ${
                            hasChar
                              ? "border-brand-accent bg-brand-accent/5 text-on-surface"
                              : "border-border text-on-surface-muted bg-surface-container"
                          }`}
                        >
                          {hasChar ? (showPin ? pin[index] : "•") : "—"}
                        </div>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPin((v) => !v)}
                    className="absolute right-3 top-1/2 flex h-[var(--touch-target-min)] w-[var(--touch-target-min)] -translate-y-1/2 items-center justify-center text-on-surface-muted hover:text-on-surface transition-colors duration-[var(--motion-duration-short)] z-30"
                    aria-label={showPin ? "Hide PIN" : "Show PIN"}
                  >
                    {showPin ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
                  </button>
                </div>

                {/* Unlock button — only shows when PIN is complete (auto-submits anyway) */}
                <RippleButton
                  type="button"
                  onClick={handleUnlock}
                  disabled={busy || pin.length !== 4 || isLocked}
                  className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-brand-accent text-[length:var(--font-size-body-lg)] font-bold text-brand-accent-contrast disabled:opacity-[var(--state-opacity-disabled-content)] hover:opacity-95 transition-opacity duration-[var(--motion-duration-short)] py-3 shadow-[var(--shadow-elevation-1)]"
                >
                  {busy ? "Checking…" : isLocked ? `Locked (${lockRemainingSeconds}s)` : "Unlock"}
                </RippleButton>

                {/* Switch user — only shown when there are multiple users */}
                {activeUsers.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(null);
                      setPin("");
                      setError(null);
                    }}
                    className="text-center text-[length:var(--font-size-body)] text-brand-accent font-semibold hover:underline"
                  >
                    Not you? Pick a different user
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Footer: switch store account (bottom, within thumb reach) */}
      <div className="shrink-0 pb-10 flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => router.push("/login?force=true")}
          className="text-center text-[length:var(--font-size-body)] text-brand-accent font-semibold hover:underline transition-colors duration-[var(--motion-duration-short)]"
        >
          {selectedUser ? "Log in with password / Different account" : "Use a different store account"}
        </button>
      </div>
    </div>
  );
}
