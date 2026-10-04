"use client";

import React from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import { formatCurrency } from "@/lib/format";

export interface MonthGroupHeaderProps {
  title: string; // e.g. "Oct 2026" or "Sep 2026"
  inflow?: number; // Total In (e.g. Sales)
  outflow?: number; // Total Out (e.g. Expenses or COGS)
  summaryText?: string; // Custom summary line if inflow/outflow not used
  analysisHref?: string; // Route link for "Analysis" button e.g. "/reports"
  onAnalysisClick?: () => void;
  isCollapsible?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  className?: string;
}

/**
 * Month/Period Group Header with In/Out Cashflow Metrics and Analysis Action.
 *
 * Matches the reference fintech design:
 * - Left: Month Name with Chevron ▼, In: ₦X.XX Out: ₦Y.YY
 * - Right: Analysis button in brand accent.
 */
export function MonthGroupHeader({
  title,
  inflow,
  outflow,
  summaryText,
  analysisHref,
  onAnalysisClick,
  isCollapsible = false,
  isCollapsed = false,
  onToggleCollapse,
  className = "",
}: MonthGroupHeaderProps) {
  return (
    <div className={`flex items-center justify-between gap-3 pt-4 pb-2 px-1 ${className}`}>
      {/* Left: Title & In/Out Metrics */}
      <div className="min-w-0 flex-1">
        {isCollapsible ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="flex items-center gap-1.5 text-left font-semibold text-[length:var(--font-size-title)] text-on-surface hover:opacity-80 transition-opacity"
            aria-expanded={!isCollapsed}
          >
            <span>{title}</span>
            {isCollapsed ? (
              <ChevronDown size={18} className="text-on-surface-muted" />
            ) : (
              <ChevronUp size={18} className="text-on-surface-muted" />
            )}
          </button>
        ) : (
          <h3 className="font-semibold text-[length:var(--font-size-title)] text-on-surface">
            {title}
          </h3>
        )}

        {/* Subtitle In/Out or Summary */}
        <div className="flex items-center gap-3 text-xs text-on-surface-muted mt-0.5 font-number tabular-nums">
          {summaryText ? (
            <span>{summaryText}</span>
          ) : (
            <>
              {inflow !== undefined && (
                <span>
                  In: <span className="font-medium text-on-surface">{formatCurrency(inflow)}</span>
                </span>
              )}
              {outflow !== undefined && (
                <span>
                  Out: <span className="font-medium text-on-surface">{formatCurrency(outflow)}</span>
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right: Analysis Pill Button */}
      {(analysisHref || onAnalysisClick) && (
        <div className="shrink-0">
          {analysisHref ? (
            <Link
              href={analysisHref}
              className="inline-flex items-center justify-center px-3.5 py-1.5 rounded-full text-xs font-semibold bg-brand-accent text-brand-accent-contrast shadow-xs hover:opacity-95 active:scale-95 transition-all"
            >
              Analysis
            </Link>
          ) : (
            <button
              type="button"
              onClick={onAnalysisClick}
              className="inline-flex items-center justify-center px-3.5 py-1.5 rounded-full text-xs font-semibold bg-brand-accent text-brand-accent-contrast shadow-xs hover:opacity-95 active:scale-95 transition-all"
            >
              Analysis
            </button>
          )}
        </div>
      )}
    </div>
  );
}
