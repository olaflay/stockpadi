"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { callBackend } from "@/features/auth/backend-client";
import { Skeleton } from "@/components/ui/Skeleton";
import { RippleButton } from "@/components/ui/Ripple";
import {
  Search,
  Power,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Clock,
  Building2,
  Store,
  RefreshCw,
  ExternalLink,
  Users,
  Copy,
  Check,
} from "lucide-react";
import { formatShortDate } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";

interface Tenant {
  id: string;
  name: string;
  business_type: string;
  currency: string;
  is_active: boolean;
  status?: "pending" | "verified" | "suspended" | "rejected";
  created_at: string;
  owner_name?: string;
  owner_email?: string;
}

export default function SuperAdminTenantsPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "verified" | "suspended" | "pending">("all");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchTenants = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    try {
      const result = await callBackend<{ businesses: Tenant[] }>("platform-api", { action: "list_businesses" });
      setTenants(result.businesses || []);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to load tenants.", "danger");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const result = await callBackend<{ businesses: Tenant[] }>("platform-api", { action: "list_businesses" });
        if (!ignore) setTenants(result.businesses || []);
      } catch (err) {
        if (!ignore) showToast(err instanceof Error ? err.message : "Failed to load tenants.", "danger");
      } finally {
        if (!ignore) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }
    void load();
    return () => { ignore = true; };
  }, [showToast]);

  async function toggleTenantStatus(tenantId: string, currentStatus: boolean, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setTogglingId(tenantId);
    try {
      const newStatus = !currentStatus;
      await callBackend("platform-api", {
        action: "set_business_status",
        businessId: tenantId,
        status: newStatus ? "verified" : "suspended",
      });

      showToast(
        `Store ${newStatus ? "activated" : "suspended"} successfully.`,
        newStatus ? "success" : "warning"
      );

      setTenants((prev) =>
        prev.map((t) =>
          t.id === tenantId
            ? { ...t, is_active: newStatus, status: newStatus ? "verified" : "suspended" }
            : t
        )
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update store status.", "danger");
    } finally {
      setTogglingId(null);
    }
  }

  async function approveTenant(tenantId: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setApprovingId(tenantId);
    try {
      await callBackend("platform-api", {
        action: "set_business_status",
        businessId: tenantId,
        status: "verified",
      });
      showToast(
        "Store verified. Verification email sent to the owner.",
        "success"
      );
      setTenants((prev) =>
        prev.map((t) =>
          t.id === tenantId
            ? { ...t, is_active: true, status: "verified" }
            : t
        )
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to approve store.", "danger");
    } finally {
      setApprovingId(null);
    }
  }

  function handleCopyId(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    showToast("Store ID copied to clipboard", "neutral");
    setTimeout(() => setCopiedId(null), 2000);
  }

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = tenants.length;
    // Status is the source of truth; is_active is also true for 'pending'.
    const verified = tenants.filter((t) => t.status === "verified").length;
    const suspended = tenants.filter((t) => t.status === "suspended" || (!t.is_active && t.status !== "pending")).length;
    const pending = tenants.filter((t) => t.status === "pending").length;
    return { total, verified, suspended, pending };
  }, [tenants]);

  // Filtered List
  const filteredTenants = useMemo(() => {
    return tenants.filter((t) => {
      const matchesSearch =
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.owner_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.business_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.id.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (statusFilter === "verified") return t.status === "verified";
      if (statusFilter === "suspended") return t.status === "suspended" || (!t.is_active && t.status !== "pending");
      if (statusFilter === "pending") return t.status === "pending";
      return true;
    });
  }, [tenants, searchQuery, statusFilter]);

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-24" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
        <Skeleton className="h-12 w-full rounded-xl" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Title & Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-on-surface">
            Tenant Directory
          </h1>
          <p className="text-xs sm:text-sm text-on-surface-muted mt-0.5">
            Monitor, inspect, and manage tenant organizations across StockPadi.
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchTenants(true)}
          disabled={refreshing}
          className="inline-flex items-center self-start sm:self-auto gap-2 rounded-lg border border-border/70 bg-surface-container-low px-3.5 py-2 text-xs font-semibold text-on-surface hover:bg-surface-container transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin text-brand-accent" : ""} />
          <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
        </button>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Total Tenants */}
        <div className="flex flex-col justify-between rounded-xl border border-border/80 bg-surface-container-low p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-on-surface-muted">Total Stores</span>
            <Building2 size={16} className="text-on-surface-muted" />
          </div>
          <p className="mt-3 text-2xl sm:text-3xl font-bold text-on-surface">{metrics.total}</p>
        </div>

        {/* Verified / Active */}
        <div className="flex flex-col justify-between rounded-xl border border-success/30 bg-success/5 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-success">Active & Verified</span>
            <CheckCircle2 size={16} className="text-success" />
          </div>
          <p className="mt-3 text-2xl sm:text-3xl font-bold text-success">{metrics.verified}</p>
        </div>

        {/* Suspended */}
        <div className="flex flex-col justify-between rounded-xl border border-danger/30 bg-danger/5 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-danger">Suspended</span>
            <XCircle size={16} className="text-danger" />
          </div>
          <p className="mt-3 text-2xl sm:text-3xl font-bold text-danger">{metrics.suspended}</p>
        </div>

        {/* Pending Review */}
        <div className="flex flex-col justify-between rounded-xl border border-border/80 bg-surface-container-low p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-on-surface-muted">Pending Review</span>
            <Clock size={16} className="text-warning" />
          </div>
          <p className="mt-3 text-2xl sm:text-3xl font-bold text-on-surface">{metrics.pending}</p>
        </div>
      </div>

      {/* Search & Status Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-muted" />
          <input
            type="search"
            placeholder="Search stores by name, owner, type, or ID…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full min-h-[42px] rounded-lg border border-border bg-surface pl-10 pr-4 text-xs sm:text-sm text-on-surface placeholder:text-on-surface-muted/60 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all"
          />
        </div>

        {/* Segmented Status Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto rounded-lg border border-border/80 bg-surface-container-low p-1 self-start sm:self-auto no-scrollbar">
          {(
            [
              { id: "all", label: "All", count: metrics.total },
              { id: "verified", label: "Active", count: metrics.verified },
              { id: "suspended", label: "Suspended", count: metrics.suspended },
              { id: "pending", label: "Pending", count: metrics.pending },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`min-h-[32px] inline-flex items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-all cursor-pointer ${
                statusFilter === tab.id
                  ? "bg-brand-accent text-brand-accent-contrast shadow-xs"
                  : "text-on-surface-muted hover:text-on-surface"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                  statusFilter === tab.id
                    ? "bg-brand-accent-contrast/20 text-brand-accent-contrast"
                    : "bg-surface-container text-on-surface-muted"
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Tenant Cards List */}
      {filteredTenants.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-surface-container-low/50 py-12 px-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container text-on-surface-muted mb-3">
            <ShieldAlert size={26} />
          </div>
          <p className="text-base font-semibold text-on-surface">No matching tenants</p>
          <p className="mt-1 text-xs sm:text-sm text-on-surface-muted max-w-sm">
            {searchQuery
              ? `No businesses matched "${searchQuery}". Try a different keyword.`
              : "No businesses found in this category."}
          </p>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-brand-accent/50 bg-brand-accent/10 px-4 py-2 text-xs font-semibold text-brand-accent hover:bg-brand-accent/15 transition-all cursor-pointer"
            >
              Clear filter
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredTenants.map((tenant) => {
            const isVerified = tenant.status === "verified";
            const isSuspended = tenant.status === "suspended" || (!tenant.is_active && tenant.status !== "pending");
            const isPending = tenant.status === "pending";

            return (
              <div
                key={tenant.id}
                className="group relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-border/80 bg-surface-container-low p-4 sm:p-5 hover:border-brand-accent/40 hover:bg-surface-container/70 transition-all shadow-xs"
              >
                {/* Store Profile Column */}
                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-accent/10 text-brand-accent border border-brand-accent/20">
                    <Store size={20} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/businesses/${tenant.id}`}
                        className="text-base font-bold text-on-surface hover:text-brand-accent transition-colors truncate"
                      >
                        {tenant.name}
                      </Link>

                      {/* Status Badge */}
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${
                          isVerified
                            ? "bg-success/10 text-success border-success/30"
                            : isSuspended
                            ? "bg-danger/10 text-danger border-danger/30"
                            : "bg-warning/10 text-warning border-warning/30"
                        }`}
                      >
                        {isVerified ? (
                          <CheckCircle2 size={11} />
                        ) : isSuspended ? (
                          <XCircle size={11} />
                        ) : (
                          <Clock size={11} />
                        )}
                        <span className="capitalize">{tenant.status ?? (tenant.is_active ? "verified" : "suspended")}</span>
                      </span>

                      {/* Business Type Badge */}
                      <span className="rounded-md bg-surface-container px-2 py-0.5 text-[10px] font-medium text-on-surface-muted uppercase tracking-wider">
                        {tenant.business_type.replace("_", " ")}
                      </span>
                    </div>

                    {/* Metadata Subtitle */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-y-1 gap-x-3 text-xs text-on-surface-muted">
                      <span className="flex items-center gap-1 text-on-surface">
                        <Users size={12} className="text-on-surface-muted" />
                        <span className="font-medium">{tenant.owner_name || "Unknown Owner"}</span>
                      </span>

                      <span>•</span>

                      <span>Registered: {formatShortDate(tenant.created_at.split("T")[0])}</span>

                      <span>•</span>

                      <button
                        type="button"
                        onClick={(e) => handleCopyId(tenant.id, e)}
                        className="inline-flex items-center gap-1 text-[11px] font-mono text-on-surface-muted hover:text-on-surface transition-colors cursor-pointer"
                        title="Click to copy full ID"
                      >
                        {copiedId === tenant.id ? (
                          <Check size={11} className="text-success" />
                        ) : (
                          <Copy size={11} />
                        )}
                        <span>{tenant.id.slice(0, 8)}…</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Actions Column */}
                <div className="flex items-center justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/50">
                  {/* View Details Link */}
                  <Link
                    href={`/admin/businesses/${tenant.id}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-on-surface hover:bg-surface-container transition-colors shadow-xs"
                  >
                    <span>Inspect</span>
                    <ExternalLink size={13} />
                  </Link>

                  {/* Status Toggle / Approve Button */}
                  {isPending ? (
                    <RippleButton
                      type="button"
                      onClick={(e) => approveTenant(tenant.id, e)}
                      disabled={approvingId === tenant.id}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold border border-success/40 bg-success/10 text-success hover:bg-success/20 transition-all cursor-pointer shadow-xs"
                      title="Verify this store and send the owner a verification code email"
                    >
                      <CheckCircle2 size={13} />
                      <span>{approvingId === tenant.id ? "Approving…" : "Approve"}</span>
                    </RippleButton>
                  ) : (
                    <RippleButton
                      type="button"
                      onClick={(e) => toggleTenantStatus(tenant.id, tenant.is_active, e)}
                      disabled={togglingId === tenant.id}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold border transition-all cursor-pointer shadow-xs ${
                        tenant.is_active
                          ? "border-danger/40 bg-danger/10 text-danger hover:bg-danger/20"
                          : "border-success/40 bg-success/10 text-success hover:bg-success/20"
                      }`}
                      title={tenant.is_active ? "Suspend this business" : "Activate this business"}
                    >
                      <Power size={13} />
                      <span>{tenant.is_active ? "Suspend" : "Activate"}</span>
                    </RippleButton>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
