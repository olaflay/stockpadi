"use client";

import { useState } from "react";
import { formatShortDate, isoDateFromShort } from "@/lib/format";

interface ShortDateInputProps {
  /** ISO "YYYY-MM-DD", matching Product.expiryDate everywhere else. */
  value: string;
  /** ISO "YYYY-MM-DD", or "" while the typed date is incomplete/invalid. */
  onChange: (isoDate: string) => void;
  className?: string;
}

/**
 * Always displays and accepts dd/mm/yy (e.g. "01/09/26") — a native
 * `<input type="date">`'s visible format is locale/browser-controlled and
 * can't be forced to one consistent format, which is what this needs to be
 * simple and unambiguous for the shop owner. Digits-only typing,
 * auto-inserts the slashes.
 */
export function ShortDateInput({ value, onChange, className = "" }: ShortDateInputProps) {
  const [text, setText] = useState(() => formatShortDate(value));
  // Adjust local display text when the external value changes out from
  // under us (e.g. the edit form loading the product), without an Effect —
  // setState during render, the pattern React recommends over
  // useEffect+setState for "derive state from a changed prop."
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(formatShortDate(value));
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const digits = event.target.value.replace(/\D/g, "").slice(0, 6);
    let formatted = digits;
    if (digits.length > 4) formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    else if (digits.length > 2) formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;

    setText(formatted);
    onChange(isoDateFromShort(formatted) ?? "");
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder="dd/mm/yy"
      value={text}
      onChange={handleChange}
      maxLength={8}
      className={`min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] border border-border bg-surface px-3 text-[length:var(--font-size-body)] text-on-surface ${className}`}
    />
  );
}
