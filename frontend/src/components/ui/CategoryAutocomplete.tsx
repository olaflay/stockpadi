"use client";

import { useRef, useState } from "react";
import { Check, Plus } from "lucide-react";

export interface CategoryOption {
  id: string;
  name: string;
}

interface CategoryAutocompleteProps {
  categories: CategoryOption[];
  recentIds: string[];
  /** Selected category id, or "" if none picked yet / a brand-new name is typed. */
  value: string;
  /** Display text — the selected category's name, or whatever's typed for a new one. */
  valueName: string;
  /** Fires on every pick or committed edit. `categoryId` is "" for a name with no existing match. */
  onSelect: (categoryId: string, name: string) => void;
  placeholder?: string;
}

/**
 * Type-to-filter category picker, "recent" categories surfacing first —
 * like a password manager autofilling a familiar value, typing something
 * new just works too (no separate "create category" screen). See
 * docs/RESEARCH-AND-PLAN.md UX feedback: "category should have autofill
 * like passwords... recent and current category would pop up."
 */
export function CategoryAutocomplete({
  categories,
  recentIds,
  value,
  valueName,
  onSelect,
  placeholder = "Type or pick a category",
}: CategoryAutocompleteProps) {
  const [query, setQuery] = useState(valueName);
  const [isOpen, setIsOpen] = useState(false);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stay in sync if the parent resets us (e.g. after a successful save),
  // without an Effect — setState during render, same pattern as
  // ShortDateInput.
  const [lastValueName, setLastValueName] = useState(valueName);
  if (valueName !== lastValueName) {
    setLastValueName(valueName);
    setQuery(valueName);
  }

  const trimmedQuery = query.trim();
  const recentSet = new Set(recentIds);
  const recentMatches = recentIds
    .map((id) => categories.find((c) => c.id === id))
    .filter((c): c is CategoryOption => Boolean(c))
    .filter((c) => c.name.toLowerCase().includes(trimmedQuery.toLowerCase()));
  const otherMatches = categories.filter(
    (c) => !recentSet.has(c.id) && c.name.toLowerCase().includes(trimmedQuery.toLowerCase())
  );
  const isNewName = trimmedQuery.length > 0 && !categories.some((c) => c.name.toLowerCase() === trimmedQuery.toLowerCase());

  function selectCategory(category: CategoryOption) {
    setQuery(category.name);
    onSelect(category.id, category.name);
    setIsOpen(false);
  }

  function selectNew() {
    onSelect("", trimmedQuery);
    setIsOpen(false);
  }

  function handleBlur() {
    // A brief delay so a suggestion's onClick still fires before the list
    // unmounts — mousedown-before-blur ordering is unreliable across browsers.
    blurTimeout.current = setTimeout(() => {
      setIsOpen(false);
      if (!trimmedQuery) {
        onSelect("", "");
        return;
      }
      const existing = categories.find((c) => c.name.toLowerCase() === trimmedQuery.toLowerCase());
      onSelect(existing ? existing.id : "", existing ? existing.name : trimmedQuery);
    }, 150);
  }

  const showDropdown = isOpen && (recentMatches.length > 0 || otherMatches.length > 0 || isNewName);
  const listboxId = "category-autocomplete-listbox";

  return (
    <div className="relative">
      <input
        type="text"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={listboxId}
        aria-autocomplete="list"
        autoComplete="off"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => {
          if (blurTimeout.current) clearTimeout(blurTimeout.current);
          setIsOpen(true);
        }}
        onBlur={handleBlur}
        placeholder={placeholder}
        className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] border border-border bg-surface px-3 text-[length:var(--font-size-body)] text-on-surface"
      />

      {showDropdown && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-[var(--radius-control)] border border-border bg-surface shadow-[var(--shadow-elevation-2)]"
        >
          {recentMatches.length > 0 && (
            <p className="px-3 pt-2 text-[length:var(--font-size-caption)] text-on-surface-muted">Recent</p>
          )}
          {recentMatches.map((category) => (
            <button
              key={category.id}
              type="button"
              role="option"
              aria-selected={category.id === value}
              onMouseDown={(e) => { e.preventDefault(); if (blurTimeout.current) clearTimeout(blurTimeout.current); selectCategory(category); }}
              onTouchEnd={(e) => { e.preventDefault(); if (blurTimeout.current) clearTimeout(blurTimeout.current); selectCategory(category); }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-[length:var(--font-size-body)] text-on-surface hover:bg-surface-container active:bg-surface-container-high"
            >
              {category.name}
              {category.id === value && <Check size={16} className="text-brand-accent" aria-hidden />}
            </button>
          ))}

          {otherMatches.length > 0 && recentMatches.length > 0 && <div className="border-t border-border" />}
          {otherMatches.map((category) => (
            <button
              key={category.id}
              type="button"
              role="option"
              aria-selected={category.id === value}
              onMouseDown={(e) => { e.preventDefault(); if (blurTimeout.current) clearTimeout(blurTimeout.current); selectCategory(category); }}
              onTouchEnd={(e) => { e.preventDefault(); if (blurTimeout.current) clearTimeout(blurTimeout.current); selectCategory(category); }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-[length:var(--font-size-body)] text-on-surface hover:bg-surface-container active:bg-surface-container-high"
            >
              {category.name}
              {category.id === value && <Check size={16} className="text-brand-accent" aria-hidden />}
            </button>
          ))}

          {isNewName && (
            <button
              type="button"
              role="option"
              aria-selected={false}
              onMouseDown={(e) => { e.preventDefault(); if (blurTimeout.current) clearTimeout(blurTimeout.current); selectNew(); }}
              onTouchEnd={(e) => { e.preventDefault(); if (blurTimeout.current) clearTimeout(blurTimeout.current); selectNew(); }}
              className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-[length:var(--font-size-body)] text-brand-accent hover:bg-surface-container active:bg-surface-container-high"
            >
              <Plus size={16} aria-hidden />
              Add &quot;{trimmedQuery}&quot; as a new category
            </button>
          )}
        </div>
      )}
    </div>
  );
}
