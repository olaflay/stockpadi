"use client";

import { useState } from "react";
import { RippleButton } from "@/components/ui/Ripple";
import { WifiOff, MessageSquare, Moon, CheckCircle2, ChevronRight } from "lucide-react";
import { EducationSuperpower } from "../types";

interface StepEducationSuperpowersProps {
  onComplete: (destination: "/pos" | "/dashboard") => void;
  isSaving: boolean;
}

const SUPERPOWERS: EducationSuperpower[] = [
  {
    id: "offline",
    iconName: "WifiOff",
    title: "100% Offline Till",
    badge: "Always Fast",
    description: "Sell even when MTN/Airtel network drops. Your records save on your phone instantly.",
    benefit: "Never lose a customer waiting for network.",
  },
  {
    id: "debtors",
    iconName: "MessageCircle",
    title: "Smart Debt Recovery",
    badge: "Recover Cash",
    description: "Track customer credit with precision. Send 1-tap professional WhatsApp balance statements.",
    benefit: "Collect what you are owed 3x faster.",
  },
  {
    id: "reconciliation",
    iconName: "Moon",
    title: "60-Second Nightly Close",
    badge: "Accurate Books",
    description: "Enter your drawer cash at the end of the day. StockPadi calculates variance automatically.",
    benefit: "No more missing cash or ledger disputes.",
  },
];

export function StepEducationSuperpowers({
  onComplete,
  isSaving,
}: StepEducationSuperpowersProps) {
  const [selectedId, setSelectedId] = useState<string>("offline");

  const icons = {
    offline: <WifiOff className="h-5 w-5 text-brand-accent shrink-0" />,
    debtors: <MessageSquare className="h-5 w-5 text-brand-accent shrink-0" />,
    reconciliation: <Moon className="h-5 w-5 text-brand-accent shrink-0" />,
  };

  return (
    <div className="flex flex-1 flex-col justify-between">
      {/* Top Header */}
      <div className="flex flex-col items-center pt-4 text-center">
        <p className="text-[length:var(--font-size-label)] font-medium text-brand-accent">
          Step 4 of 4 • You&apos;re All Set
        </p>
        <h1 className="mt-1 text-[length:var(--font-size-title-lg)] font-bold text-on-surface">
          Three ways StockPadi protects your shop
        </h1>
        <p className="mt-1 text-[length:var(--font-size-body)] text-on-surface-muted max-w-xs">
          Built for the daily reality of Nigerian retail businesses.
        </p>
      </div>

      {/* Interactive Micro-Cards (Education by clicking/interacting) */}
      <div className="my-auto flex flex-col gap-2.5 py-2">
        {SUPERPOWERS.map((power) => {
          const isSelected = selectedId === power.id;
          return (
            <div
              key={power.id}
              onClick={() => setSelectedId(power.id)}
              className={`flex flex-col rounded-[var(--radius-card)] border-2 p-3.5 text-left transition-all cursor-pointer ${
                isSelected
                  ? "border-brand-accent bg-brand-accent/8 shadow-sm"
                  : "border-transparent bg-surface-container hover:bg-surface-container-high"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  {icons[power.id as keyof typeof icons]}
                  <span className="text-[length:var(--font-size-body)] font-semibold text-on-surface">
                    {power.title}
                  </span>
                </div>
                <span className="rounded-full bg-brand-accent/15 px-2 py-0.5 text-[11px] font-medium text-brand-accent">
                  {power.badge}
                </span>
              </div>

              <p className="mt-1.5 text-[length:var(--font-size-body-sm)] text-on-surface leading-relaxed">
                {power.description}
              </p>

              {isSelected && (
                <div className="mt-2 flex items-center gap-1.5 text-[length:var(--font-size-caption)] font-medium text-brand-accent">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{power.benefit}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Action Buttons: Open POS Till or Dashboard */}
      <div className="flex flex-col gap-2.5 pb-8">
        <RippleButton
          type="button"
          onClick={() => onComplete("/pos")}
          disabled={isSaving}
          className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-brand-accent text-[length:var(--font-size-body-lg)] font-semibold text-brand-accent-contrast hover:opacity-95 transition-opacity flex items-center justify-center gap-2"
        >
          <span>{isSaving ? "Setting up shop..." : "Launch Till & Make First Sale"}</span>
          <ChevronRight className="h-5 w-5" />
        </RippleButton>

        <button
          type="button"
          onClick={() => onComplete("/dashboard")}
          disabled={isSaving}
          className="min-h-[var(--touch-target-min)] text-[length:var(--font-size-body)] font-medium text-on-surface-muted hover:text-on-surface transition-colors"
        >
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}
