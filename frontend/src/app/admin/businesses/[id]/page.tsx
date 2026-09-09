"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { callBackend } from "@/features/auth/backend-client";
import { Skeleton } from "@/components/ui/Skeleton";
import { RippleButton } from "@/components/ui/Ripple";
import { useToast } from "@/components/ui/Toast";
import {
  Store,
  Users,
  Package,
  ShieldCheck,
  Power,
  ArrowLeft,
  Copy,
  Check,
  Clock,
  CheckCircle2,
  XCircle,
  MapPin,
  RefreshCw,
} from "lucide-react";
import { formatShortDate } from "@/lib/format";

interface BranchDetail {
  id: string;
  name: string;
  address?: string;
  is_active: boolean;
}

interface BusinessDetail {
  id: string;
  name: string;
  business_type: string;
  currency: string;
  status?: "pending" | "verified" | "suspended" | "rejected";
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  owner_name?: string;
  owner_id?: string | null;
  branches?: BranchDetail[];
  branch_count?: number;
  product_count?: number;
  worker_count?: number;
}

export default function AdminBusinessDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [business, setBusiness] = useState<BusinessDetail | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [toggling, setToggling] = useState(false);

  const fetchDetail = useCallback(async (isSilent = false) => {
    if (!id) return;
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const res = await callBackend<{ business: BusinessDetail | null }>("platform-api", {
        action: "get_business",
        businessId: id,
      });
      setBusiness(res.business);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to load store details.", "danger");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, showToast]);

  useEffect(() => {
    let ignore = false;
    async function load() {
      if (!id) return;
      try {
        const res = await callBackend<{ business: BusinessDetail | null }>("platform-api", {
          action: "get_business",
          businessId: id,
        });
        if (!ignore) setBusiness(res.business);
      } catch (err) {
        if (!ignore) showToast(err instanceof Error ? err.message : "Failed to load store details.", "danger");
      } finally {
        if (!ignore) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }
    void load();
    return () => { ignore = true; };
  }, [id, showToast]);

  async function handleToggleStatus() {
    if (!business) return;
    setToggling(true);
    const newStatus = !business.is_active;
    try {
      await callBackend("platform-api", {
        action: "set_business_status",
        businessId: business.id,
        status: newStatus ? "verified" : "suspended",
      });

      showToast(`Store ${newStatus ? "activated" : "suspended"} successfully.`, newStatus ? "success" : "warning");
      setBusiness((prev) =>
        prev
          ? {
              ...prev,
              is_active: newStatus,
              status: newStatus ? "verified" : "suspended",
            }
          : null
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update store status.", "danger");
    } finally {
      setToggling(false);
    }
  }

  function handleCopyId() {
    if (!business?.id) return;
    navigator.clipboard.writeText(business.id);
    setCopiedId(true);
    showToast("Store ID copied to clipboard", "neutral");
    setTimeout(() => setCopiedId(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-32" />
        </div>
        <Skeleton className="h-44 w-full rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!business) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-surface-container-low/50 py-16 px-4 text-center">
        <Store size={36} className="text-on-surface-muted mb-3 opacity-40" />
        <p className="text-lg font-bold text-on-surface">Store not found</p>
        <p className="mt-1 text-xs text-on-surface-muted max-w-sm">
          The requested store ID does not exist or has been decommissioned.
        </p>
        <Link
          href="/admin"
          className="mt-5 inline-flex items-center gap-2 rounded-lg border border-brand-accent/50 bg-brand-accent/10 px-4 py-2 text-xs font-semibold text-brand-accent hover:bg-brand-accent/15 transition-all"
        >
          <ArrowLeft size={14} />
          <span>Return to Tenant Directory</span>
        </Link>
      </div>
    );
  }

  const isVerified = business.is_active && business.status !== "suspended";
  const isSuspended = !business.is_active || business.status === "suspended";

  return (
    <div className="flex flex-col gap-6">
      {/* Top Breadcrumb & Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-on-surface-muted hover:text-on-surface transition-colors"
        >
          <ArrowLeft size={16} />
          <span>Back to Tenant Directory</span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchDetail(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-surface px-3 py-2 text-xs font-semibold text-on-surface hover:bg-surface-container transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin text-brand-accent" : ""} />
            <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
          </button>

          <RippleButton
            type="button"
            onClick={handleToggleStatus}
            disabled={toggling}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold border transition-all cursor-pointer shadow-xs ${
              business.is_active
                ? "border-danger/40 bg-danger/10 text-danger hover:bg-danger/20"
                : "border-success/40 bg-success/10 text-success hover:bg-success/20"
            }`}
          >
            <Power size={13} />
            <span>{business.is_active ? "Suspend Store" : "Activate Store"}</span>
          </RippleButton>
        </div>
      </div>

      {/* Main Tenant Profile Card */}
      <div className="rounded-2xl border border-border/80 bg-surface-container-low p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-accent/15 text-brand-accent border border-brand-accent/30 shadow-xs">
              <Store size={28} />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-on-surface">
                  {business.name}
                </h1>

                {/* Status Badge */}
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                    isVerified
                      ? "bg-success/10 text-success border-success/30"
                      : isSuspended
                      ? "bg-danger/10 text-danger border-danger/30"
                      : "bg-warning/10 text-warning border-warning/30"
                  }`}
                >
                  {isVerified ? (
                    <CheckCircle2 size={12} />
                  ) : isSuspended ? (
                    <XCircle size={12} />
                  ) : (
                    <Clock size={12} />
                  )}
                  <span className="capitalize">{business.status ?? (business.is_active ? "verified" : "suspended")}</span>
                </span>
              </div>

              {/* Store ID with copy */}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-on-surface-muted">
                <span className="font-medium">Store UUID:</span>
                <span className="font-mono text-on-surface bg-surface-container px-2 py-0.5 rounded text-[11px]">
                  {business.id}
                </span>
                <button
                  type="button"
                  onClick={handleCopyId}
                  className="inline-flex items-center gap-1 text-[11px] text-brand-accent hover:underline cursor-pointer"
                >
                  {copiedId ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copiedId ? "Copied" : "Copy"}</span>
                </button>
              </div>

              {/* Chips */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-surface-container-high px-2.5 py-1 text-xs font-medium text-on-surface uppercase tracking-wider">
                  Type: {business.business_type.replace("_", " ")}
                </span>
                <span className="rounded-md bg-surface-container-high px-2.5 py-1 text-xs font-medium text-on-surface">
                  Currency: {business.currency}
                </span>
                <span className="rounded-md bg-surface-container-high px-2.5 py-1 text-xs font-medium text-on-surface-muted">
                  Created: {formatShortDate(business.created_at.split("T")[0])}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid of Inspection Sections */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Owner Profile */}
        <div className="flex flex-col justify-between rounded-xl border border-border/80 bg-surface-container-low p-5 shadow-xs">
          <div>
            <div className="flex items-center gap-2 text-on-surface font-bold text-sm border-b border-border/60 pb-3">
              <Users size={16} className="text-brand-accent" />
              <span>Owner Account</span>
            </div>

            <div className="mt-4 flex flex-col gap-2.5">
              <div>
                <span className="text-[11px] text-on-surface-muted uppercase tracking-wider font-semibold">
                  Full Name
                </span>
                <p className="text-sm font-semibold text-on-surface mt-0.5">
                  {business.owner_name || "Unknown Owner"}
                </p>
              </div>

              <div>
                <span className="text-[11px] text-on-surface-muted uppercase tracking-wider font-semibold">
                  Role Privilege
                </span>
                <p className="text-xs font-mono text-on-surface mt-0.5">
                  BUSINESS_OWNER
                </p>
              </div>

              {business.owner_id && (
                <div>
                  <span className="text-[11px] text-on-surface-muted uppercase tracking-wider font-semibold">
                    User UUID
                  </span>
                  <p className="text-[11px] font-mono text-on-surface-muted truncate mt-0.5">
                    {business.owner_id}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-lg bg-surface-container p-2.5 text-[11px] text-on-surface-muted">
            Authenticated via Supabase Auth. Holds tenant admin privileges.
          </div>
        </div>

        {/* Card 2: Operational Catalog Scale */}
        <div className="flex flex-col justify-between rounded-xl border border-border/80 bg-surface-container-low p-5 shadow-xs">
          <div>
            <div className="flex items-center gap-2 text-on-surface font-bold text-sm border-b border-border/60 pb-3">
              <Package size={16} className="text-brand-accent" />
              <span>Operational Scale</span>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-surface-container p-2.5">
                <span className="text-lg font-bold text-on-surface">{business.branch_count ?? 0}</span>
                <p className="text-[10px] text-on-surface-muted mt-0.5 font-medium">Branches</p>
              </div>

              <div className="rounded-lg bg-surface-container p-2.5">
                <span className="text-lg font-bold text-on-surface">{business.product_count ?? 0}</span>
                <p className="text-[10px] text-on-surface-muted mt-0.5 font-medium">Products</p>
              </div>

              <div className="rounded-lg bg-surface-container p-2.5">
                <span className="text-lg font-bold text-on-surface">{business.worker_count ?? 0}</span>
                <p className="text-[10px] text-on-surface-muted mt-0.5 font-medium">Staff</p>
              </div>
            </div>

            {/* Branch listing */}
            {business.branches && business.branches.length > 0 && (
              <div className="mt-4 flex flex-col gap-2">
                <span className="text-[11px] text-on-surface-muted uppercase tracking-wider font-semibold">
                  Branch Locations
                </span>
                <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto pr-1">
                  {business.branches.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between rounded-md bg-surface p-2 text-xs border border-border/50"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <MapPin size={12} className="text-brand-accent shrink-0" />
                        <span className="font-medium text-on-surface truncate">{b.name}</span>
                      </div>
                      <span className="text-[10px] text-on-surface-muted font-mono shrink-0">
                        {b.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 rounded-lg bg-surface-container p-2.5 text-[11px] text-on-surface-muted">
            Independent stock & staff partitioning per branch.
          </div>
        </div>

        {/* Card 3: Security & RLS Partitioning */}
        <div className="flex flex-col justify-between rounded-xl border border-border/80 bg-surface-container-low p-5 shadow-xs">
          <div>
            <div className="flex items-center gap-2 text-on-surface font-bold text-sm border-b border-border/60 pb-3">
              <ShieldCheck size={16} className="text-brand-accent" />
              <span>Isolation & Ledger</span>
            </div>

            <div className="mt-4 flex flex-col gap-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-on-surface-muted">Multi-Tenant Isolation:</span>
                <span className="font-semibold text-success flex items-center gap-1">
                  <CheckCircle2 size={12} />
                  <span>RLS Enforced</span>
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-on-surface-muted">Inventory Ledger:</span>
                <span className="font-semibold text-on-surface">Append-Only Delta</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-on-surface-muted">Offline Sync:</span>
                <span className="font-semibold text-on-surface">Dexie + Workbox</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-on-surface-muted">Card/Wallet PCI Scope:</span>
                <span className="font-semibold text-on-surface">Zero (Tag-Only)</span>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-lg bg-surface-container p-2.5 text-[11px] text-on-surface-muted">
            Strict row-level security isolates this tenant from all other shops.
          </div>
        </div>
      </div>
    </div>
  );
}
