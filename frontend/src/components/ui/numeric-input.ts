export type NumericDraft = string;

/** Preserve the exact draft; parse only when validating or committing it. */
export function parseNumericDraft(value: string): NumericDraft {
  return value;
}
