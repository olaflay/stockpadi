"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { db, BUSINESS_PROFILE_SINGLETON_ID } from "@/lib/db";
import { BUSINESS_TYPE_TEMPLATES } from "@/config/business-types";
import { useToast } from "@/components/ui/Toast";
import { WelcomeIllustration } from "@/components/illustrations";
import { RippleButton } from "@/components/ui/Ripple";
import { TextInput } from "@/components/ui/TextInput";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Business-type selection — step 1 of the onboarding flow.
 * Fits entirely on one screen with no scrolling needed.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [checking, setChecking] = useState(true);
  const [businessName, setBusinessName] = useState("");
  const [selectedId, setSelectedId] = useState(BUSINESS_TYPE_TEMPLATES[0].id);

  useEffect(() => {
    db.businessProfile.get(BUSINESS_PROFILE_SINGLETON_ID).then((profile) => {
      if (profile) {
        router.replace("/sales");
      } else {
        setChecking(false);
      }
    });
  }, [router]);

  async function handleContinue() {
    if (!businessName.trim()) return;
    const template = BUSINESS_TYPE_TEMPLATES.find((t) => t.id === selectedId)!;

    await db.transaction("rw", db.businessProfile, db.categories, db.branches, async () => {
      await db.businessProfile.put({
        id: BUSINESS_PROFILE_SINGLETON_ID,
        name: businessName.trim(),
        businessTypeId: template.id,
        currency: "NGN",
      });
      await db.categories.bulkPut(
        template.defaultCategories.map((name) => ({ id: crypto.randomUUID(), name }))
      );
      await db.branches.add({ id: crypto.randomUUID(), name: "Main branch", isActive: true });
    });

    showToast(`${businessName.trim()} is set up`, "success");
    router.push("/dashboard");
  }

  async function handleSkip() {
    const template =
      BUSINESS_TYPE_TEMPLATES.find((t) => t.id === "general_retail") || BUSINESS_TYPE_TEMPLATES[0];

    await db.transaction("rw", db.businessProfile, db.categories, db.branches, async () => {
      await db.businessProfile.put({
        id: BUSINESS_PROFILE_SINGLETON_ID,
        name: "My Retail Shop",
        businessTypeId: template.id,
        currency: "NGN",
      });
      await db.categories.bulkPut(
        template.defaultCategories.map((name) => ({ id: crypto.randomUUID(), name }))
      );
      await db.branches.add({ id: crypto.randomUUID(), name: "Main branch", isActive: true });
    });

    showToast("Setup skipped. You can customize settings later.", "success");
    router.push("/dashboard");
  }

  if (checking) {
    return (
      <div className="flex h-screen w-full flex-col px-6 max-w-md mx-auto justify-center gap-4">
        <Skeleton className="h-10 w-48 mx-auto" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col px-6 relative">
      {/* Skip Button */}
      <div className="absolute right-6 top-6 z-10">
        <button
          type="button"
          onClick={handleSkip}
          className="text-[length:var(--font-size-body)] font-semibold text-brand-accent hover:underline min-h-[var(--touch-target-min)] px-2"
        >
          Skip
        </button>
      </div>

      {/* Header */}
      <div className="flex flex-col items-center gap-2 pt-16 text-center">
        <WelcomeIllustration className="h-16 w-16 text-brand-accent" />
        <p className="text-[length:var(--font-size-label)] text-on-surface-muted">Business setup</p>
        <h1 className="text-[length:var(--font-size-title-lg)] font-semibold text-on-surface">
          Tell us about your business
        </h1>
        <p className="text-[length:var(--font-size-body)] text-on-surface-muted">
          Works offline. Your records stay on this device.
        </p>
      </div>

      {/* Form fields — grow to fill space between header and button */}
      <div className="flex flex-1 flex-col justify-center gap-5">
        {/* Business name */}
        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--font-size-label)] font-medium text-on-surface-muted">
            Business name
          </span>
          <TextInput
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="e.g. Adaeze General Store"
          />
        </label>

        {/* Business type */}
        <div className="flex flex-col gap-2">
          <span className="text-[length:var(--font-size-label)] font-medium text-on-surface-muted">
            Business type
          </span>
          <div className="grid grid-cols-2 gap-2">
            {BUSINESS_TYPE_TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => setSelectedId(template.id)}
                className={`flex min-h-[var(--touch-target-min)] flex-col rounded-[var(--radius-card)] border-2 px-3 py-2.5 text-left transition-colors ${
                  selectedId === template.id
                    ? "border-brand-accent bg-brand-accent/8"
                    : "border-transparent bg-surface-container hover:bg-surface-container-high"
                }`}
              >
                <span className="text-[length:var(--font-size-body)] font-medium text-on-surface">
                  {template.label}
                </span>
                <span className="text-[length:var(--font-size-caption)] text-on-surface-muted leading-tight">
                  {template.notes}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* CTA pinned to bottom */}
      <div className="pb-10 pt-4">
        <RippleButton
          type="button"
          onClick={handleContinue}
          disabled={!businessName.trim()}
          className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-brand-accent text-[length:var(--font-size-body-lg)] font-semibold text-brand-accent-contrast disabled:opacity-50 hover:opacity-95 transition-opacity"
        >
          Continue
        </RippleButton>
      </div>
    </div>
  );
}
