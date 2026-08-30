"use client";

import { WelcomeIllustration } from "@/components/illustrations";
import { TextInput } from "@/components/ui/TextInput";
import { RippleButton } from "@/components/ui/Ripple";
import { ShieldCheck, WifiOff, Download } from "lucide-react";

interface StepTrustMarketingProps {
  businessName: string;
  onChangeBusinessName: (val: string) => void;
  onNext: () => void;
}

export function StepTrustMarketing({
  businessName,
  onChangeBusinessName,
  onNext,
}: StepTrustMarketingProps) {
  return (
    <div className="flex flex-1 flex-col justify-between">
      {/* Top Focus Block (Samsung One UI) */}
      <div className="flex flex-col items-center pt-8 text-center">
        <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-[var(--radius-card)] bg-brand-accent/10">
          <WelcomeIllustration className="h-12 w-12 text-brand-accent" />
        </div>
        <p className="text-[length:var(--font-size-label)] font-medium text-brand-accent">
          Welcome to StockPadi
        </p>
        <h1 className="mt-1 text-[length:var(--font-size-title-lg)] font-bold text-on-surface">
          Your shop, on your phone.
        </h1>
        <p className="mt-1 text-[length:var(--font-size-body)] text-on-surface-muted max-w-xs">
          Works with no network. Your records stay on this phone. Export them any time.
        </p>

        {/* Marketing Trust Badges */}
        <div className="mt-5 grid w-full grid-cols-3 gap-2">
          <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] bg-surface-container p-2.5 text-center">
            <WifiOff className="h-4 w-4 text-brand-accent" />
            <span className="mt-1.5 text-[length:var(--font-size-caption)] font-medium text-on-surface">
              100% Offline
            </span>
          </div>
          <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] bg-surface-container p-2.5 text-center">
            <ShieldCheck className="h-4 w-4 text-brand-accent" />
            <span className="mt-1.5 text-[length:var(--font-size-caption)] font-medium text-on-surface">
              Zero Lockout
            </span>
          </div>
          <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] bg-surface-container p-2.5 text-center">
            <Download className="h-4 w-4 text-brand-accent" />
            <span className="mt-1.5 text-[length:var(--font-size-caption)] font-medium text-on-surface">
              Export Free
            </span>
          </div>
        </div>
      </div>

      {/* Center Input (Sentence case, One UI thumb reach) */}
      <div className="my-auto py-6">
        <label className="flex flex-col gap-1.5 text-left">
          <span className="text-[length:var(--font-size-label)] font-medium text-on-surface">
            What is your shop or business name?
          </span>
          <TextInput
            value={businessName}
            onChange={(e) => onChangeBusinessName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && businessName.trim()) {
                e.preventDefault();
                onNext();
              }
            }}
            placeholder="e.g. Adaeze General Store"
            autoFocus
            autoCapitalize="words"
          />
        </label>
      </div>

      {/* Bottom CTA Button */}
      <div className="pb-8">
        <RippleButton
          type="button"
          onClick={onNext}
          disabled={!businessName.trim()}
          className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-brand-accent text-[length:var(--font-size-body-lg)] font-semibold text-brand-accent-contrast disabled:opacity-50 hover:opacity-95 transition-opacity"
        >
          Continue
        </RippleButton>
      </div>
    </div>
  );
}
