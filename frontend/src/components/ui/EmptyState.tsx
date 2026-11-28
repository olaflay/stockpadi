"use client";

import { StateCard } from "@/components/ui/StateCard";
import type { EmptySceneKind } from "@/components/illustrations/EmptyScene";

interface EmptyStateProps {
  title: string;
  description: string;
  action?: { label: string; onClick?: () => void; href?: string; id?: string };
  scene: EmptySceneKind;
  className?: string;
}

/** First-run and empty-list guidance, with an action appropriate to the current screen. */
export function EmptyState({ title, description, action, scene, className }: EmptyStateProps) {
  return <StateCard scene={scene} title={title} description={description} action={action} className={className} />;
}
