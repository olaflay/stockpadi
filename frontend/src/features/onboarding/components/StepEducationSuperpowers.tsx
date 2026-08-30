"use client";

import { useState } from "react";
import { RippleButton } from "@/components/ui/Ripple";
import { WifiOff, MessageSquare, Moon, CheckCircle2, ChevronRight } from "lucide-react";
import { EducationSuperpower } from "../types";

interface StepEducationSuperpowersProps {
  onComplete: (destination: "/pos" | "/dashboard") => void;
  isSaving: boolean;
}

const SHOP_RULES: EducationSuperpower[] = [
  {
    id: "offline",
    iconName: "WifiOff",
    title: "Works with no network",
    badge: "Offline",
    description: "Sell even when internet or data drops. Every record saves directly on your phone.",
    benefit: "Never keep a customer waiting for network.",
  },
  {
    id: "debtors",
    iconName: "MessageCircle",
    title: "Clear customer credit",
    badge: "Debtors",
    description: "Keep track of who owes you. Send a clear WhatsApp statement in one tap.",
    benefit: "Get paid on time with zero confusion.",
  },
  {
    id: "reconciliation",
    iconName: "Moon",
    title: "Fast daily balancing",
    badge: "Close day",
    description: "Enter your drawer cash at the end of the day. StockPadi checks for any difference.",
    benefit: "Know your exact profit and cash balance.",
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
          Step 4 of 4 • Final step
        </p>
        <h1 className="mt-1 text-[length:var(--font-size-title-lg)] font-bold text-on-surface">
          Three key things to know
        </h1>
        <p className="mt-1 text-[length:var(--font-size-body)] text-on-surface-muted max-w-xs">
          How StockPadi protects your shop every day.
        </p>
      </div>

      {/* Interactive Micro-Cards */}
      <div className="my-auto flex flex-col gap-2.5 py-2" role="radiogroup" aria-label="Key shop protection rules">
        {SHOP_RULES.map((item) => {
          const isSelected = selectedId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setSelectedId(item.id)}
              className={`flex flex-col rounded-[var(--radius-card)] border-2 p-3.5 text-left transition-all min-h-[var(--touch-target-min)] ${
                isSelected
                  ? "border-brand-accent bg-brand-accent/8 shadow-sm"
                  : "border-transparent bg-surface-container hover:bg-surface-container-high"
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2.5">
                  {icons[item.id as keyof typeof icons]}
                  <span className="text-[length:var(--font-size-body)] font-semibold text-on-surface">
                    {item.title}
                  </span>
                </div>
                <span className="rounded-full bg-brand-accent/15 px-2 py-0.5 text-[11px] font-medium text-brand-accent">
                  {item.badge}
                </span>
              </div>

              <p className="mt-1.5 text-[length:var(--font-size-body-sm)] text-on-surface leading-relaxed">
                {item.description}
              </p>

              {isSelected && (
                <div className="mt-2 flex items-center gap-1.5 text-[length:var(--font-size-caption)] font-medium text-brand-accent">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{item.benefit}</span>
                </div>
              )}
            </button>
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
          <span>{isSaving ? "Opening shop..." : "Start selling"}</span>
          <ChevronRight className="h-5 w-5" />
        </RippleButton>

        <button
          type="button"
          onClick={() => onComplete("/dashboard")}
          disabled={isSaving}
          className="min-h-[var(--touch-target-min)] text-[length:var(--font-size-body)] font-medium text-on-surface-muted hover:text-on-surface transition-colors"
        >
          Go to dashboard
        </button>
      </div>
    </div>
  );
}
