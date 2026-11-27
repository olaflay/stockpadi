import { forwardRef } from "react";
import { ChevronDown } from "lucide-react";

interface SelectInputProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Turns the border red, matching TextInput's hasError, for required selects. */
  hasError?: boolean;
  validationState?: "warning" | "error";
}

/**
 * Every native <select> in the app used the bare browser arrow with only
 * px-3 of padding, so it read as flush against the edge. This wraps a
 * select with appearance-none + reserved right padding + a positioned
 * chevron, mirroring the pattern the search input already uses for its
 * left-side icon. Forwards ref so react-hook-form's register() still works.
 */
export const SelectInput = forwardRef<HTMLSelectElement, SelectInputProps>(
  function SelectInput({ className = "", hasError = false, validationState, "aria-invalid": ariaInvalid, ...props }, ref) {
    const invalid = hasError || validationState === "error" ? true : ariaInvalid;

    return (
      <div className="relative">
        <select
          ref={ref}
          {...props}
          aria-invalid={invalid}
          data-validation-state={validationState === "warning" ? "warning" : undefined}
          className={`form-field min-h-[var(--touch-target-min)] w-full appearance-none rounded-[var(--radius-control)] border border-border bg-surface pl-3.5 pr-9 text-[length:var(--font-size-body-lg)] text-on-surface outline-none transition-all duration-[var(--motion-duration-short)] shadow-[var(--shadow-recessed)] ${className}`}
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
