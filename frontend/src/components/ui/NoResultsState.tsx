import { useRouter } from "next/navigation";
import { Search, Plus } from "lucide-react";
import { RippleButton } from "@/components/ui/Ripple";

interface NoResultsStateProps {
  query: string;
  onClear?: () => void;
  className?: string;
}

/** Distinct from EmptyState: the data exists, this filter/search just matched nothing. */
export function NoResultsState({ query, onClear, className }: NoResultsStateProps) {
  const router = useRouter();

  return (
    <div
      role="status"
      className={`flex flex-1 w-full max-w-md mx-auto flex-col justify-between my-auto rounded-2xl depth-card bg-surface-container-low border border-border/60 p-6 sm:p-7 overflow-hidden animate-step-in select-none ${className ?? ""}`}
    >
      <div className="flex flex-1 flex-col items-center justify-center text-center py-2 sm:py-4">
        <div className="mb-3.5 flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-high shrink-0 depth-bubble">
          <Search size={24} className="text-on-surface-muted" aria-hidden />
        </div>

        <p className="text-base sm:text-lg font-bold text-on-surface leading-snug">
          No results for &quot;{query}&quot;
        </p>

        <p className="mt-2 max-w-xs text-xs sm:text-sm text-on-surface-muted leading-relaxed">
          Try a different keyword or create this product right away.
        </p>
      </div>

      <div className="flex w-full flex-col items-center gap-2 pt-4 mt-auto">
        <RippleButton
          type="button"
          onClick={() => router.push(`/products/new?prefill=${encodeURIComponent(query)}`)}
          className="w-full min-h-[var(--touch-target-min)] flex items-center justify-center gap-2 rounded-[var(--radius-control)] border border-brand-accent/50 bg-brand-accent/10 px-4 py-3 text-sm font-semibold text-brand-accent hover:bg-brand-accent/15 active:scale-[0.98] transition-all cursor-pointer shadow-xs"
        >
          <Plus size={16} aria-hidden />
          <span>Create &quot;{query}&quot;</span>
        </RippleButton>

        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="min-h-[var(--touch-target-min)] text-xs font-semibold text-on-surface-muted hover:text-on-surface transition-colors cursor-pointer"
          >
            Clear search filter
          </button>
        )}
      </div>
    </div>
  );
}
