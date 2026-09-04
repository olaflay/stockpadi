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
      className={`flex flex-col items-center justify-center text-center animate-step-in w-full max-w-sm mx-auto px-6 py-8 rounded-[var(--radius-focus-block)] bg-surface-container my-auto ${className ?? ""}`}
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-container-high shrink-0">
        <Search size={26} className="text-on-surface-muted" aria-hidden />
      </div>

      <p className="text-[length:var(--font-size-title-lg)] font-bold text-on-surface leading-snug">
        No results for &quot;{query}&quot;
      </p>

      <p className="mt-1.5 max-w-xs text-[length:var(--font-size-body)] text-on-surface-muted leading-relaxed">
        Try a different keyword or create this product right away.
      </p>

      <div className="mt-5 flex flex-col items-center gap-2 w-full max-w-xs">
        <RippleButton
          type="button"
          onClick={() => router.push(`/products/new?prefill=${encodeURIComponent(query)}`)}
          className="w-full min-h-[var(--touch-target-min)] flex items-center justify-center gap-2 rounded-[var(--radius-control)] bg-brand-accent px-5 py-2.5 text-[length:var(--font-size-body)] font-semibold text-brand-accent-contrast shadow-[var(--shadow-elevation-1)] hover:opacity-95 transition-opacity"
        >
          <Plus size={18} aria-hidden />
          <span>Create &quot;{query}&quot;</span>
        </RippleButton>

        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="min-h-[var(--touch-target-min)] text-xs font-semibold text-on-surface-muted hover:text-on-surface transition-colors"
          >
            Clear search filter
          </button>
        )}
      </div>
    </div>
  );
}
