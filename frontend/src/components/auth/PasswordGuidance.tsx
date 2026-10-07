import { getPasswordRequirements, meetsPasswordPolicy } from "@stockpadi/contracts";

interface PasswordGuidanceProps {
  password: string;
  active?: boolean;
}

/**
 * Fast, local-only feedback. No password is sent while the person types.
 * The same rule is enforced by the registration API.
 */
export function PasswordGuidance({ password, active = true }: PasswordGuidanceProps) {
  const checks = getPasswordRequirements(password);
  if (!active && password.length === 0) return null;

  const passedCount = checks.filter((check) => check.passed).length;
  const valid = meetsPasswordPolicy(password);
  const nextRequirement = checks.find((check) => !check.passed);
  const level = valid ? 3 : passedCount >= 3 ? 2 : 1;
  const levelLabel = valid ? "Ready to use" : level === 2 ? "Almost there" : "Getting started";

  return (
    <div className="mt-1 space-y-1 px-1 text-[length:var(--font-size-caption)]" role="status" aria-live="polite">
      <div className="flex items-center gap-2">
        <span
          className="flex gap-0.5"
          aria-label={`Password progress: ${levelLabel}`}
        >
          {[1, 2, 3].map((segment) => (
            <span
              key={segment}
              aria-hidden
              className={`h-1.5 w-6 rounded-full ${segment <= level ? (valid ? "bg-success" : "bg-brand-accent") : "bg-surface-container-highest"}`}
            />
          ))}
        </span>
        <span className={valid ? "font-medium text-success" : "text-on-surface-muted"}>{levelLabel}</span>
      </div>
      <p className={valid ? "text-success" : "text-on-surface-muted"}>
        {valid
          ? "Good password."
          : password.length === 0
            ? "Use 8 or more characters with uppercase, lowercase, a number, and a symbol."
            : `Add ${nextRequirement?.label.toLowerCase() ?? "the remaining requirement"}.`}
      </p>
    </div>
  );
}

export function PasswordMatchGuidance({ password, confirmation, active = false }: { password: string; confirmation: string; active?: boolean }) {
  const shouldEvaluate = confirmation.length >= 3 && password.length >= 3;
  if (!active && !shouldEvaluate) return null;
  if (confirmation.length === 0) return <p className="mt-1 px-1 text-[length:var(--font-size-caption)] text-on-surface-muted" role="status">Re-enter the password to confirm it.</p>;
  const matches = password === confirmation;
  return (
    <p className={`mt-1 px-1 text-[length:var(--font-size-caption)] ${matches ? "text-success" : "text-on-surface-muted"}`} role="status" aria-live="polite">
      {matches ? "Passwords match." : "Enter the same password in both fields."}
    </p>
  );
}
