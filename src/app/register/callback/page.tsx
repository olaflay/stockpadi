"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { Store, Package, Pill, Cpu, ArrowLeft } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { db, BUSINESS_PROFILE_SINGLETON_ID } from "@/lib/db";
import { BUSINESS_TYPE_TEMPLATES } from "@/config/business-types";
import { startSession } from "@/features/auth/session";
import { hashPin } from "@/lib/pin-hash";
import { callManageStaff } from "@/features/auth/manage-staff-client";
import { useOnlineStatus } from "@/lib/use-online-status";
import { useToast } from "@/components/ui/Toast";
import { RippleButton } from "@/components/ui/Ripple";
import { RegisterIllustration } from "@/components/illustrations/RegisterIllustration";
import { useScrollToError } from "@/hooks/use-scroll-to-error";
import type { Role } from "@/types/roles";
import { Skeleton } from "@/components/ui/Skeleton";
import { TextInput } from "@/components/ui/TextInput";

const inputClass =
  "min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] border border-border bg-surface px-4 text-[length:var(--font-size-body-lg)] text-on-surface w-full focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/20 outline-none transition-colors duration-[var(--motion-duration-short)]";

const BUSINESS_TYPE_ICONS: Record<string, React.ElementType> = {
  grocery_supermarket: Store,
  pharmacy_fmcg: Pill,
  electronics_accessories: Cpu,
  general_retail: Package,
};

export default function RegisterCallbackPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const isOnline = useOnlineStatus();

  const [step, setStep] = useState<1 | 2>(1);
  const [businessName, setBusinessName] = useState("");
  const [selectedBusinessTypeId, setSelectedBusinessTypeId] = useState(BUSINESS_TYPE_TEMPLATES[0].id);

  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const errorRef = useScrollToError<HTMLDivElement>(error);
  const [userLoading, setUserLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;

    supabase.auth.getUser().then(({ data, error }) => {
      if (error || !data.user) {
        router.replace("/register");
      } else {
        // If the user already has a business profile loaded locally, they are just logging in.
        db.localUsers.toArray().then((users) => {
          if (users.find((u) => u.id === data.user.id)) {
            router.replace("/unlock");
          } else {
            setUser(data.user);
            setUserLoading(false);
          }
        });
      }
    });
  }, [router]);

  const step1Complete = businessName.trim() !== "";

  function handleNextStep() {
    setError(null);
    if (!step1Complete) {
      setError("Fill out your store details before continuing.");
      return;
    }
    setStep(2);
  }

  async function handleFinishSetup() {
    setError(null);
    if (pin !== confirmPin || !/^\d{4}$/.test(pin)) {
      setError("Enter a matching 4-digit PIN to continue.");
      return;
    }
    if (!isOnline) {
      setError("Completing account setup needs an internet connection.");
      return;
    }

    setBusy(true);
    try {
      const supabase = getSupabase();
      if (!supabase) return;

      // Update the user metadata with the business details so the trigger fires
      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          business_name: businessName.trim(),
          business_type_id: selectedBusinessTypeId,
          role: "owner",
        },
      });

      if (updateError) {
        setError("Failed to update account details. Try again.");
        setBusy(false);
        return;
      }
      if (!user) {
        setError("User session lost. Please register again.");
        setBusy(false);
        return;
      }

      const userId = user.id;
      const fullName = user.user_metadata?.full_name || user.email?.split("@")[0] || "Owner";
      const pinHash = await hashPin(pin);
      const template = BUSINESS_TYPE_TEMPLATES.find((t) => t.id === selectedBusinessTypeId)!;

      await db.transaction("rw", db.businessProfile, db.categories, db.branches, db.localUsers, async () => {
        await db.businessProfile.put({
          id: BUSINESS_PROFILE_SINGLETON_ID,
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
          fullName: fullName,
          role: "owner" as Role,
          pinHash,
          isActive: true,
          emailVerified: true,
          updatedAt: new Date().toISOString(),
        });
      });

      await startSession(userId);

      try {
        await callManageStaff({ action: "set_own_pin", pinHash });
      } catch {
        showToast("Account created. PIN saved locally — will sync when online.", "warning");
        router.replace("/dashboard");
        return;
      }

      router.replace("/dashboard");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (userLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Skeleton className="h-10 w-10 rounded-full" />
      </div>
    );
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
            {step === 1 ? "Complete your profile" : "Set your PIN"}
          </h1>
          <p className="text-[length:var(--font-size-body)] text-on-surface-muted">
            {step === 1
              ? "Tell us about your store to get started"
              : "You'll use this PIN every day to unlock the app"}
          </p>
        </div>

        <div className="flex gap-2 mt-1" aria-hidden>
          <div className={`h-1.5 w-8 rounded-full transition-colors duration-[var(--motion-duration-medium)] ${step >= 1 ? "bg-brand-accent" : "bg-border"}`} />
          <div className={`h-1.5 w-8 rounded-full transition-colors duration-[var(--motion-duration-medium)] ${step === 2 ? "bg-brand-accent" : "bg-border"}`} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-8">
        {error && (
          <div
            ref={errorRef}
            role="alert"
            className="rounded-[var(--radius-card)] bg-danger-container px-4 py-3 text-[length:var(--font-size-body)] text-on-danger-container font-medium mt-5"
          >
            {error}
          </div>
        )}

        {step === 1 ? (
          <div className="flex flex-col gap-4 mt-5">
            <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface-container/40 p-4">
              <p className="text-[length:var(--font-size-label)] font-semibold text-on-surface-muted uppercase tracking-wide">
                Store details
              </p>

              <label className="flex flex-col gap-1.5">
                <span className="text-[length:var(--font-size-label)] font-semibold text-on-surface-muted">
                  Store name
                </span>
                <input
                  id="register-business-name"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Kola Provisions"
                  className={inputClass}
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

            <RippleButton
              type="button"
              onClick={handleNextStep}
              disabled={!step1Complete}
              className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-brand-accent text-[length:var(--font-size-body-lg)] font-bold text-brand-accent-contrast disabled:opacity-[var(--state-opacity-disabled-content)] hover:opacity-95 transition-opacity duration-[var(--motion-duration-short)] py-3 shadow-[var(--shadow-elevation-1)]"
            >
              Next: Set your PIN
            </RippleButton>
          </div>
        ) : (
          <div className="flex flex-col gap-5 mt-5">
            <div className="rounded-[var(--radius-card)] border border-border bg-surface-container/40 p-4">
              <div className="flex gap-4">
                <label className="flex flex-col gap-1.5 flex-1">
                  <span className="text-[length:var(--font-size-label)] font-semibold text-on-surface-muted">
                    4-Digit PIN
                  </span>
                  <TextInput
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="0000"
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    className="text-center tracking-widest text-lg"
                  />
                </label>
                <label className="flex flex-col gap-1.5 flex-1">
                  <span className="text-[length:var(--font-size-label)] font-semibold text-on-surface-muted">
                    Confirm PIN
                  </span>
                  <TextInput
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="0000"
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    className="text-center tracking-widest text-lg"
                  />
                </label>
              </div>
            </div>

            <p className="text-center text-[length:var(--font-size-caption)] text-on-surface-muted px-2">
              Staff will use this every day to access the register. Keep it private.
            </p>

            <RippleButton
              id="register-submit"
              type="button"
              onClick={handleFinishSetup}
              disabled={busy || pin !== confirmPin || !/^\d{4}$/.test(pin)}
              className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-brand-accent text-[length:var(--font-size-body-lg)] font-bold text-brand-accent-contrast disabled:opacity-[var(--state-opacity-disabled-content)] hover:opacity-95 transition-opacity duration-[var(--motion-duration-short)] py-3 shadow-[var(--shadow-elevation-1)]"
            >
              {busy ? "Finishing setup…" : "Complete setup"}
            </RippleButton>

            <button
              type="button"
              onClick={() => { setStep(1); setError(null); }}
              className="flex items-center justify-center gap-2 text-center text-[length:var(--font-size-body)] text-on-surface-muted hover:text-on-surface hover:underline pb-4 transition-colors duration-[var(--motion-duration-short)]"
            >
              <ArrowLeft size={16} aria-hidden />
              Back to store details
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
