import { Search } from "lucide-react";

/** Distinct from EmptyState: the data exists, this filter/search just matched nothing. */
export function NoResultsState({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] bg-surface-container px-6 py-10 text-center">
      <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-surface-container-high">
        <Search size={20} className="text-on-surface-muted" aria-hidden />
      </div>
      <p className="text-[length:var(--font-size-body-lg)] font-medium text-on-surface">
        No results for &quot;{query}&quot;
      </p>
      <p className="text-[length:var(--font-size-body)] text-on-surface-muted">
        Try a different search term or check the spelling.
      </p>
    </div>
  );
}
