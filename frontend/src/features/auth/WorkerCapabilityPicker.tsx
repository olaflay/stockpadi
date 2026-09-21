"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { WORKER_CAPABILITIES, type WorkerCapability } from "./authorization";

export interface WorkerCapabilityPreset {
  id: string;
  label: string;
  description: string;
  capabilities: readonly WorkerCapability[];
}

/**
 * Friendly starting points for staff access. These are only UI presets: the
 * exact canonical capability list is still sent to, and enforced by, Node.
 */
export const WORKER_CAPABILITY_PRESETS: readonly WorkerCapabilityPreset[] = [
  {
    id: "sales-person",
    label: "Sales person",
    description: "Sell, find products, serve customers, handle credit, and view their receipts.",
    capabilities: [
      "POS_SELL", "VIEW_PRODUCTS", "VIEW_BRANCH_STOCK", "VIEW_CUSTOMERS",
      "USE_CUSTOMER_CREDIT", "VIEW_OWN_SALES", "VIEW_RECEIPTS", "CREATE_CUSTOMERS",
    ],
  },
  {
    id: "stock-officer",
    label: "Stock officer",
    description: "See branch stock, receive deliveries, count stock, and make stock corrections.",
    capabilities: [
      "VIEW_PRODUCTS", "VIEW_BRANCH_STOCK", "VIEW_STOCK_MOVEMENTS", "RECEIVE_STOCK",
      "SUBMIT_STOCK_COUNT", "ADJUST_STOCK",
    ],
  },
  {
    id: "branch-manager",
    label: "Branch manager",
    description: "Run daily branch operations, reports, staff access, products, stock, and expenses.",
    capabilities: [
      "POS_SELL", "VIEW_PRODUCTS", "VIEW_BRANCH_STOCK", "VIEW_STOCK_MOVEMENTS",
      "SUBMIT_STOCK_COUNT", "SUBMIT_RECONCILIATION", "VIEW_CUSTOMERS", "USE_CUSTOMER_CREDIT",
      "VIEW_OWN_SALES", "VIEW_RECEIPTS", "VIEW_ALERTS", "RECEIVE_STOCK", "RECORD_REPAYMENT",
      "VIEW_BRANCH_RECONCILIATION", "CREATE_CUSTOMERS", "MANAGE_PRODUCTS", "ADJUST_STOCK",
      "MANAGE_EXPENSES", "VIEW_REPORTS", "MANAGE_BRANCH_WORKERS",
    ],
  },
];

const CAPABILITY_LABELS: Record<WorkerCapability, string> = {
  POS_SELL: "Make sales",
  VIEW_PRODUCTS: "View products",
  VIEW_BRANCH_STOCK: "View branch stock",
  VIEW_STOCK_MOVEMENTS: "View stock movement history",
  SUBMIT_STOCK_COUNT: "Submit stock counts",
  SUBMIT_RECONCILIATION: "Submit close-day count",
  VIEW_CUSTOMERS: "View customers",
  USE_CUSTOMER_CREDIT: "Use customer credit",
  VIEW_OWN_SALES: "View own sales",
  VIEW_RECEIPTS: "View receipts",
  VIEW_ALERTS: "View alerts",
  RECEIVE_STOCK: "Receive stock",
  RECORD_REPAYMENT: "Record repayments",
  VIEW_BRANCH_RECONCILIATION: "View branch close days",
  CREATE_CUSTOMERS: "Create customers",
  MANAGE_PRODUCTS: "Manage products",
  ADJUST_STOCK: "Adjust stock",
  MANAGE_EXPENSES: "Manage expenses",
  VIEW_REPORTS: "View reports",
  MANAGE_BRANCHES: "Manage branches",
  MANAGE_BRANCH_WORKERS: "Manage branch workers",
};

function uniqueCapabilities(capabilities: readonly WorkerCapability[]): WorkerCapability[] {
  const selected = new Set(capabilities);
  return WORKER_CAPABILITIES.filter((capability) => selected.has(capability));
}

export function applyCapabilityPreset(
  current: readonly WorkerCapability[],
  preset: WorkerCapabilityPreset,
  checked: boolean,
): WorkerCapability[] {
  return checked
    ? uniqueCapabilities([...current, ...preset.capabilities])
    : current.filter((capability) => !preset.capabilities.includes(capability));
}

export function WorkerCapabilityPicker({
  value,
  onChange,
}: {
  value: readonly WorkerCapability[];
  onChange: (capabilities: WorkerCapability[]) => void;
}) {
  const [showFineTune, setShowFineTune] = useState(false);
  const selected = new Set(value);

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-[length:var(--font-size-label)] font-semibold text-on-surface-muted">Access</legend>
      <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
        Start with a job type, then fine-tune only if needed.
      </p>

      <div className="grid gap-2">
        {WORKER_CAPABILITY_PRESETS.map((preset) => {
          const enabled = preset.capabilities.every((capability) => selected.has(capability));
          return (
            <label key={preset.id} className="flex min-h-[var(--touch-target-min)] cursor-pointer items-start gap-3 rounded-[var(--radius-control)] bg-surface-container p-3 text-on-surface hover:bg-surface-container-high transition-colors">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => onChange(applyCapabilityPreset(value, preset, event.target.checked))}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-brand-accent)]"
                aria-label={`${preset.label} access`}
              />
              <span>
                <span className="block text-[length:var(--font-size-body)] font-semibold">{preset.label}</span>
                <span className="mt-0.5 block text-[length:var(--font-size-caption)] text-on-surface-muted">{preset.description}</span>
              </span>
            </label>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setShowFineTune((open) => !open)}
        aria-expanded={showFineTune}
        className="inline-flex min-h-[var(--touch-target-min)] items-center gap-2 self-start rounded-[var(--radius-control)] px-2 text-[length:var(--font-size-caption)] font-medium text-brand-accent hover:bg-brand-accent/10"
      >
        {showFineTune ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
        {showFineTune ? "Hide individual access" : "Fine-tune individual access"}
      </button>

      {showFineTune && (
        <div className="grid gap-1 rounded-[var(--radius-card)] bg-surface-container-low p-3 sm:grid-cols-2">
          {WORKER_CAPABILITIES.map((capability) => (
            <label key={capability} className="flex min-h-[var(--touch-target-min)] items-center gap-2 rounded-[var(--radius-control)] px-2 text-[length:var(--font-size-caption)] text-on-surface hover:bg-surface-container">
              <input
                type="checkbox"
                checked={selected.has(capability)}
                onChange={(event) => onChange(event.target.checked
                  ? uniqueCapabilities([...value, capability])
                  : value.filter((item) => item !== capability))}
                className="h-4 w-4 shrink-0 accent-[var(--color-brand-accent)]"
              />
              {CAPABILITY_LABELS[capability]}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}
