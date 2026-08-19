import { forwardRef, useState } from "react";

interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
  /** id of the element (usually a <span role="alert">) describing the error, wired to aria-describedby. */
  errorId?: string;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  function TextInput({ className = "", type, onChange, onBlur, value, hasError = false, errorId, ...props }, ref) {
    const [internalError, setInternalError] = useState(false);

    // Validate email if the input type is email
    const validateEmail = (val: string) => {
      if (!val) return false;
      // Ensure it contains @ and a dot domain (user requested like @ or .com)
      return !(val.includes("@") && val.includes("."));
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (type === "email") {
        // Remove spaces and lowercase immediately
        e.target.value = e.target.value.replace(/\s/g, "").toLowerCase();
      }

      // Once an error has been shown, keep validating live so it clears the
      // moment the field becomes valid again — but never show it before the
      // user has actually finished typing once (see handleBlur).
      if (type === "email" && internalError) {
        setInternalError(validateEmail(e.target.value));
      }

      if (onChange) {
        onChange(e);
      }
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      // Validated on blur only, not per keystroke — a still-being-typed
      // valid address (e.g. right after typing just "n" of "name@x.com")
      // must not flash an error while the user is mid-entry.
      if (type === "email") {
        setInternalError(validateEmail(e.target.value));
      }

      if (onBlur) {
        onBlur(e);
      }
    };

    const isError = hasError || internalError;

    const baseClass = "min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-surface/80 backdrop-blur-sm px-4 text-[length:var(--font-size-body-lg)] text-on-surface shadow-sm outline-none transition-all duration-[var(--motion-duration-short)]";
    const normalClass = "border border-border/60 focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/30";
    const errorClass = "border-2 border-danger focus:border-danger focus:ring-2 focus:ring-danger/30 text-danger";

    return (
      <input
        ref={ref}
        type={type}
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        aria-invalid={isError || undefined}
        aria-describedby={isError ? errorId : undefined}
        {...props}
        className={`${baseClass} ${isError ? errorClass : normalClass} ${className}`}
      />
    );
  }
);
