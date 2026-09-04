import { forwardRef } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Every native <select> in the app used the bare browser arrow with only
 * px-3 of padding, so it read as flush against the edge. This wraps a
 * select with appearance-none + reserved right padding + a positioned
 * chevron, mirroring the pattern the search input already uses for its
 * left-side icon. Forwards ref so react-hook-form's register() still works.
 */
export const SelectInput = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function SelectInput({ className = "", ...props }, ref) {
    return (
      <div className="relative">
        <select
          ref={ref}
          {...props}
          className={`min-h-[var(--touch-target-min)] w-full appearance-none rounded-[var(--radius-control)] border border-border/80 bg-surface pl-3.5 pr-9 text-[length:var(--font-size-body-lg)] text-on-surface focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/20 outline-none transition-all duration-[var(--motion-duration-short)] ${className}`}
        />
        <ChevronDown
          size={18}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-muted"
          aria-hidden
        />
      </div>
    );
  }
);
