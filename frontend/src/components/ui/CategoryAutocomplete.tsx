"use client";

import React, { useRef, useState } from "react";
import { Check, Plus, X, ChevronDown } from "lucide-react";

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
 * Highlights the matching substring in suggestion text for fast visual scanning.
 */
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <span>{text}</span>;
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return <span>{text}</span>;

  const before = text.slice(0, index);
  const match = text.slice(index, index + query.length);
  const after = text.slice(index + query.length);

  return (
    <span>
      {before}
      <span className="font-bold text-brand-accent underline underline-offset-2 decoration-brand-accent/40">
        {match}
      </span>
      {after}
    </span>
  );
}

/**
 * Real-time category autocomplete with:
 * - Live search filtering as the user types
 * - Highlighted match characters
 * - Clear 'X' button to quickly erase and re-enter
 * - Auto-scroll into visible field of view above virtual keyboard
 * - Dropdown toggle that dismisses keyboard for browsing
 * - Quick "+ Add as new category" when name is new
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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stay in sync if parent resets value without unmounting
  const [lastValueName, setLastValueName] = useState(valueName);
  if (valueName !== lastValueName) {
    setLastValueName(valueName);
    setQuery(valueName);
  }

  const trimmedQuery = query.trim();
  const recentSet = new Set(recentIds);

  // Filter matches: prefix matches first, then substring
  const matchingCategories = categories.filter((c) =>
    c.name.toLowerCase().includes(trimmedQuery.toLowerCase())
  );

  const recentMatches = recentIds
    .map((id) => categories.find((c) => c.id === id))
    .filter((c): c is CategoryOption => Boolean(c))
    .filter((c) => c.name.toLowerCase().includes(trimmedQuery.toLowerCase()));

  const otherMatches = matchingCategories.filter((c) => !recentSet.has(c.id));

  const isExactMatch = categories.some(
    (c) => c.name.toLowerCase() === trimmedQuery.toLowerCase()
  );
  const isNewName = trimmedQuery.length > 0 && !isExactMatch;

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
    blurTimeout.current = setTimeout(() => {
      setIsOpen(false);
      if (!trimmedQuery) {
        onSelect("", "");
        return;
      }
      const existing = categories.find(
        (c) => c.name.toLowerCase() === trimmedQuery.toLowerCase()
      );
      onSelect(existing ? existing.id : "", existing ? existing.name : trimmedQuery);
    }, 150);
  }

  function handleClear(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setQuery("");
    onSelect("", "");
    setIsOpen(true);
    inputRef.current?.focus();
    window.setTimeout(() => {
      inputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }

  function handleToggleDropdown(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (isOpen) {
      setIsOpen(false);
    } else {
      // Dismiss mobile keyboard to give user full view of all categories
      inputRef.current?.blur();
      setIsOpen(true);
      window.setTimeout(() => {
        inputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (isNewName) {
        selectNew();
      } else if (recentMatches.length > 0) {
        selectCategory(recentMatches[0]);
      } else if (otherMatches.length > 0) {
        selectCategory(otherMatches[0]);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  const showDropdown =
    isOpen && (recentMatches.length > 0 || otherMatches.length > 0 || isNewName);
  const listboxId = "category-autocomplete-listbox";

  return (
    <div className="relative">
      <div className="relative flex items-center">
        <input
          ref={inputRef}
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
            window.setTimeout(() => {
              inputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 180);
          }}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] border border-border bg-surface pl-3 pr-20 text-[length:var(--font-size-body)] text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-accent/20"
        />

        <div className="absolute right-1.5 flex items-center gap-0.5">
          {query.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear category input"
              className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-muted hover:text-on-surface hover:bg-surface-container active:scale-90 transition-all focus:outline-none"
            >
              <X size={15} aria-hidden />
            </button>
          )}

          <button
            type="button"
            onClick={handleToggleDropdown}
            aria-label={isOpen ? "Close categories list" : "Browse all categories"}
            className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-muted hover:text-on-surface hover:bg-surface-container active:scale-90 transition-all focus:outline-none"
          >
            <ChevronDown
              size={16}
              className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
        </div>
      </div>

      {showDropdown && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-[var(--radius-control)] border border-border bg-surface shadow-[var(--shadow-elevation-3)]"
        >
          {recentMatches.length > 0 && (
            <p className="px-3 pt-2 text-[length:var(--font-size-caption)] text-on-surface-muted font-medium">
              Recent
            </p>
          )}
          {recentMatches.map((category) => (
            <button
              key={category.id}
              type="button"
              role="option"
              aria-selected={category.id === value}
              onMouseDown={(e) => {
                e.preventDefault();
                if (blurTimeout.current) clearTimeout(blurTimeout.current);
                selectCategory(category);
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                if (blurTimeout.current) clearTimeout(blurTimeout.current);
                selectCategory(category);
              }}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left text-[length:var(--font-size-body)] text-on-surface hover:bg-surface-container active:bg-surface-container-high transition-colors"
            >
              <HighlightMatch text={category.name} query={trimmedQuery} />
              {category.id === value && (
                <Check size={16} className="text-brand-accent shrink-0" aria-hidden />
              )}
            </button>
          ))}

          {otherMatches.length > 0 && recentMatches.length > 0 && (
            <div className="border-t border-border/60" />
          )}
          {otherMatches.map((category) => (
            <button
              key={category.id}
              type="button"
              role="option"
              aria-selected={category.id === value}
              onMouseDown={(e) => {
                e.preventDefault();
                if (blurTimeout.current) clearTimeout(blurTimeout.current);
                selectCategory(category);
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                if (blurTimeout.current) clearTimeout(blurTimeout.current);
                selectCategory(category);
              }}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left text-[length:var(--font-size-body)] text-on-surface hover:bg-surface-container active:bg-surface-container-high transition-colors"
            >
              <HighlightMatch text={category.name} query={trimmedQuery} />
              {category.id === value && (
                <Check size={16} className="text-brand-accent shrink-0" aria-hidden />
              )}
            </button>
          ))}

          {isNewName && (
            <button
              type="button"
              role="option"
              aria-selected={false}
              onMouseDown={(e) => {
                e.preventDefault();
                if (blurTimeout.current) clearTimeout(blurTimeout.current);
                selectNew();
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                if (blurTimeout.current) clearTimeout(blurTimeout.current);
                selectNew();
              }}
              className="flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-[length:var(--font-size-body)] text-brand-accent hover:bg-surface-container active:bg-surface-container-high font-medium"
            >
              <Plus size={16} className="shrink-0" aria-hidden />
              <span>
                Add &quot;<strong>{trimmedQuery}</strong>&quot; as a new category
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
