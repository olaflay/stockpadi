"use client";

import React from "react";
import { formatCurrency } from "@/lib/format";
import { RippleLink } from "@/components/ui/Ripple";

export type TransactionStatus = "completed" | "cancelled" | "owing";

export interface TransactionItemRowProps {
  href?: string;
  onClick?: () => void;
  icon: React.ReactNode;
  iconBgClass?: string;
  title: string;
  subtitle: string;
  amount: number;
  amountPrefix?: "+" | "−" | "";
  status?: TransactionStatus;
  statusLabel?: string;
  className?: string;
}

const STATUS_CONFIG: Record<TransactionStatus, { label: string; textClass: string }> = {
  completed: { label: "", textClass: "" },
  owing: { label: "Owing", textClass: "text-purple-400 font-medium" },
  cancelled: { label: "Cancelled", textClass: "text-danger font-medium" },
};

/**
 * Standardized timeline row for sales, expenses, and inventory transactions.
 */
export function TransactionItemRow({
  href,
  onClick,
  icon,
  iconBgClass = "bg-brand-accent/15 text-brand-accent-active",
  title,
  subtitle,
  amount,
  amountPrefix = "",
  status = "completed",
  statusLabel,
  className = "",
}: TransactionItemRowProps) {
  const statusInfo = STATUS_CONFIG[status] || { label: statusLabel || "", textClass: "text-on-surface-muted" };
  const displayStatusLabel = statusLabel !== undefined ? statusLabel : statusInfo.label;

  const content = (
    <div
      className={`flex items-center justify-between gap-3 px-3.5 py-3 rounded-2xl bg-surface-container-low border border-border/20 hover:bg-surface-container active:scale-[0.99] transition-all ${className}`}
    >
      {/* Left: Icon Avatar & Details */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconBgClass}`}
          aria-hidden
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-on-surface">{title}</p>
          <p className="truncate text-xs text-on-surface-muted mt-0.5">{subtitle}</p>
        </div>
      </div>

      {/* Right: Amount & Status Tag (Only when cancelled or owing) */}
      <div className="flex flex-col items-end shrink-0">
        <span
          className={`font-number text-sm sm:text-base font-semibold tabular-nums ${
            amountPrefix === "+"
              ? "text-brand-accent"
              : amountPrefix === "−"
              ? "text-danger"
              : "text-on-surface"
          }`}
        >
          {amountPrefix}
          {formatCurrency(amount)}
        </span>
        {displayStatusLabel ? (
          <span className={`text-[11px] ${statusInfo.textClass}`}>
            {displayStatusLabel}
          </span>
        ) : null}
      </div>
    </div>
  );

  if (href) {
    return (
      <RippleLink href={href} className="block w-full">
        {content}
      </RippleLink>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="w-full text-left">
        {content}
      </button>
    );
  }

  return content;
}
