import { Check } from "lucide-react";
import { getPasswordRequirements, meetsPasswordPolicy } from "@stockpadi/contracts";

interface PasswordGuidanceProps {
  password: string;
}

/**
 * Fast, local-only feedback. No password is sent while the person types.
 * The same rule is enforced by the registration API.
 */
export function PasswordGuidance({ password }: PasswordGuidanceProps) {
  const checks = getPasswordRequirements(password);
  const passedCount = checks.filter((check) => check.passed).length;
  const strong = meetsPasswordPolicy(password);
  const strength = password.length === 0 ? "" : strong ? "Strong password" : "Not strong enough";

  return (
    <div className="mt-1 space-y-1.5 px-1 text-[length:var(--font-size-caption)]" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <span className="text-on-surface-muted">Make it easy to remember, hard to guess.</span>
        {strength && <span className={strong ? "font-medium text-success" : "font-medium text-danger"}>{strength}</span>}
      </div>
      <ul className="grid gap-1 sm:grid-cols-2">
        {checks.map((check) => (
          <li key={check.label} className={`flex items-center gap-1 ${check.passed ? "text-success" : "text-on-surface-muted"}`}>
            <Check size={13} aria-hidden className={check.passed ? "opacity-100" : "opacity-35"} />
            <span>{check.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
