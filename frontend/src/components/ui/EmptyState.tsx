"use client";

import type { LucideIcon } from "lucide-react";
import type { ComponentType } from "react";
import { StateCard } from "@/components/ui/StateCard";

interface EmptyStateProps {
  title: string;
  description: string;
  action?: { label: string; onClick?: () => void; href?: string; id?: string };
  /**
   * A real icon in a soft tonal container, following Samsung One UI & M3.
   */
  icon?: LucideIcon;
  /**
   * Hand-authored SVG illustration for key emotional moments.
   */
  illustration?: ComponentType<{ className?: string }>;
  /**
   * Legacy flag kept for backward compatibility; rendering now maintains
   * consistent close CTA spacing across all viewports.
   */
  fullScreen?: boolean;
  className?: string;
}

/** First-run guidance with a clear redirect action. Never a dead end. */
export function EmptyState({
  title,
  description,
  action,
  icon: Icon,
  illustration: Illustration,
  className,
}: EmptyStateProps) {
  return (
    <StateCard
      icon={Icon}
      illustration={Illustration}
      title={title}
      description={description}
      action={action}
      className={className}
    />
  );
}
