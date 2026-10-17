"use client";

import { Share, PlusSquare, Sparkles, Check, Download } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RippleButton } from "@/components/ui/Ripple";
import { getBrandingConfig } from "@/config/branding";

export interface IosInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function IosInstallModal({ isOpen, onClose }: IosInstallModalProps) {
  const branding = getBrandingConfig();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Install ${branding.businessName}`}
      variant="sheet"
      maxWidth="max-w-md"
    >
      <div className="flex flex-col gap-5 px-1 py-2 text-on-surface">
        {/* Header App Card */}
        <div className="flex items-center gap-3.5 rounded-2xl bg-surface-container p-3.5 border border-border/50">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-accent text-brand-accent-contrast shadow-sm font-bold text-lg">
            {branding.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logoUrl}
                alt={branding.businessName}
                className="h-full w-full rounded-xl object-contain"
              />
            ) : (
              <Download size={22} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-on-surface truncate">
              {branding.businessName}
            </h3>
            <p className="text-xs text-on-surface-muted truncate">
              Offline-First POS & Inventory App
            </p>
          </div>
        </div>

        {/* Step-by-step instructions */}
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold text-on-surface-muted uppercase tracking-wider">
            Install on your iPhone in 3 simple steps
          </p>

          <ol className="flex flex-col gap-3 list-none p-0 m-0">
            {/* Step 1 */}
            <li className="flex items-start gap-3.5 rounded-xl bg-surface-container-low p-3 border border-border/30">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-accent/15 text-xs font-bold text-brand-accent">
                1
              </span>
              <div className="flex-1 text-sm text-on-surface leading-snug">
                Tap the <span className="font-semibold text-brand-accent">Share button</span>{" "}
                <Share
                  size={16}
                  className="inline-block text-brand-accent mx-1 align-text-bottom"
                  aria-label="Share icon"
                />{" "}
                at the bottom of your Safari screen.
              </div>
            </li>

            {/* Step 2 */}
            <li className="flex items-start gap-3.5 rounded-xl bg-surface-container-low p-3 border border-border/30">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-accent/15 text-xs font-bold text-brand-accent">
                2
              </span>
              <div className="flex-1 text-sm text-on-surface leading-snug">
                Scroll down the options and select{" "}
                <span className="font-semibold text-brand-accent">Add to Home Screen</span>{" "}
                <PlusSquare
                  size={16}
                  className="inline-block text-brand-accent mx-1 align-text-bottom"
                  aria-label="Add to home screen icon"
                />.
              </div>
            </li>

            {/* Step 3 */}
            <li className="flex items-start gap-3.5 rounded-xl bg-surface-container-low p-3 border border-border/30">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-accent/15 text-xs font-bold text-brand-accent">
                3
              </span>
              <div className="flex-1 text-sm text-on-surface leading-snug">
                Tap <span className="font-semibold text-brand-accent">Add</span> in the top-right corner to finish.
              </div>
            </li>
          </ol>
        </div>

        {/* Offline benefit badge */}
        <div className="flex items-center gap-2.5 rounded-xl bg-brand-accent/10 p-3 text-xs text-brand-accent font-medium">
          <Sparkles size={16} className="shrink-0 text-brand-accent" />
          <span>
            Once added, {branding.businessName} works completely offline like a native app.
          </span>
        </div>

        {/* Action Button */}
        <RippleButton
          type="button"
          onClick={onClose}
          className="mt-1 flex min-h-[var(--touch-target-min)] w-full items-center justify-center gap-2 rounded-xl bg-brand-accent py-3 text-sm font-bold text-brand-accent-contrast shadow-[var(--shadow-elevation-1)] hover:opacity-95 transition-opacity"
        >
          <Check size={18} />
          <span>Got it</span>
        </RippleButton>
      </div>
    </Modal>
  );
}
