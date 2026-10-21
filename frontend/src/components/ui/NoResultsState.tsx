"use client";

import { Search } from "lucide-react";
import { StateCard } from "@/components/ui/StateCard";

interface NoResultsStateProps {
  query: string;
  /**
   * What the user was searching within, used in the heading. Defaults to
   * "items" so the copy stays true on every screen that uses this.
   */
  entityLabel?: string;
  /**
   * The CTA that creates the missing thing. Supplied by the caller because
   * only the caller knows what "create" means on this screen — a product,
   * a contact, a stock count. When omitted, the card offers no create
   * action rather than a wrong one.
   */
  action?: { label: string; onClick?: () => void; href?: string };
  /** Quiet secondary action, e.g. "Clear search filter". */
  onClear?: () => void;
  className?: string;
}

/**
 * Distinct from EmptyState: the data exists, this filter/search just matched
 * nothing. Renders through the shared StateCard so every state view keeps
 * one layout, per `.agents/rules/design-system.md`.
 */
export function NoResultsState({
  query,
  entityLabel = "items",
  action,
  onClear,
  className,
}: NoResultsStateProps) {
  return (
    <StateCard
      icon={Search}
      title={`No results for "${query}"`}
      description={`Try a different keyword or clear the search to see all ${entityLabel}.`}
      action={action}
      secondaryAction={onClear ? { label: "Clear search filter", onClick: onClear } : undefined}
      className={className}
    />
  );
}
