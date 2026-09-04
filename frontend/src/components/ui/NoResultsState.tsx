import { useRouter } from "next/navigation";
import { Search, Plus } from "lucide-react";
import { RippleButton } from "@/components/ui/Ripple";

/** Distinct from EmptyState: the data exists, this filter/search just matched nothing. */
export function NoResultsState({ query }: { query: string }) {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] bg-surface-container px-6 py-10 text-center">
      <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-surface-container-high">
        <Search size={20} className="text-on-surface-muted" aria-hidden />
      </div>
      <p className="text-[length:var(--font-size-body-lg)] font-medium text-on-surface">
        No results for &quot;{query}&quot;
      </p>
      <p className="text-[length:var(--font-size-body)] text-on-surface-muted">
        Try a different search term, or add it now.
      </p>
      <RippleButton
        type="button"
        onClick={() => router.push(`/products/new?prefill=${encodeURIComponent(query)}`)}
        className="mt-2 flex min-h-[var(--touch-target-min)] items-center gap-2 rounded-[var(--radius-control)] bg-brand-accent px-4 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast hover:opacity-95 transition-opacity"
      >
        <Plus size={16} aria-hidden />
        Create &quot;{query}&quot;
      </RippleButton>
    </div>
  );
}
