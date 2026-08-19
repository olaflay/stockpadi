"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db, SESSION_SINGLETON_ID } from "@/lib/db";
import { callBackend } from "@/features/auth/backend-client";
import { signOut } from "@/features/auth/logout";
import { Skeleton } from "@/components/ui/Skeleton";
import { RippleButton } from "@/components/ui/Ripple";
import { Search, Power, ShieldAlert, LogOut, CheckCircle, XCircle } from "lucide-react";
import { formatShortDate } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";

interface Tenant {
  id: string;
  name: string;
  business_type: string;
  is_active: boolean;
  status?: "pending" | "verified" | "suspended" | "rejected";
  created_at: string;
  owner_name?: string;
  owner_email?: string;
}

export default function SuperAdminPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Client-side session check
  const adminUser = useLiveQuery(async () => {
    const session = await db.session.get(SESSION_SINGLETON_ID);
    if (!session || new Date(session.expiresAt).getTime() < Date.now()) return null;
    const u = await db.localUsers.get(session.userId);
    return u && u.accountType === "ADMIN" ? u : null;
  }, []);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    try {
      const result = await callBackend<{ businesses: Tenant[] }>("platform-api", { action: "list_businesses" });
      setTenants(result.businesses);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to load tenants.", "danger");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (adminUser === null) {
      router.replace("/login");
    } else if (adminUser) {
      setTimeout(() => fetchTenants(), 0);
    }
  }, [adminUser, router, fetchTenants]);

  async function toggleTenantStatus(tenantId: string, currentStatus: boolean) {
    setTogglingId(tenantId);
    try {
      const newStatus = !currentStatus;
      await callBackend("platform-api", { action: "set_business_status", businessId: tenantId, status: newStatus ? "verified" : "suspended" });

      showToast(
        `Tenant ${newStatus ? "activated" : "suspended"} successfully.`,
        newStatus ? "success" : "warning"
      );

      // Update local state
      setTenants((prev) =>
        prev.map((t) => (t.id === tenantId ? { ...t, is_active: newStatus, status: newStatus ? "verified" : "suspended" } : t))
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update tenant status.", "danger");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  const filteredTenants = tenants.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.owner_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (adminUser === undefined || adminUser === null) {
    return (
      <div className="flex h-screen w-full flex-col px-6 py-6 max-w-md mx-auto justify-center gap-4">
        <Skeleton className="h-10 w-48 mx-auto" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-surface px-6 py-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex flex-col">
          <span className="text-[length:var(--font-size-caption)] text-on-surface-muted">System Administration</span>
          <h1 className="text-[length:var(--font-size-title-lg)] font-bold text-on-surface">Tenant Manager</h1>
        </div>
        <button
          onClick={handleSignOut}
          className="flex h-10 w-10 items-center justify-center rounded-full text-danger hover:bg-danger/10 transition-colors"
          title="Sign Out"
        >
          <LogOut size={20} />
        </button>
      </div>
      <div className="mb-5 flex gap-2 overflow-x-auto">
        <Link href="/admin/businesses" className="min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] bg-brand-accent px-4 py-2 text-sm font-medium text-brand-accent-contrast">Businesses</Link>
        <Link href="/admin/broadcasts" className="min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] border border-border px-4 py-2 text-sm text-on-surface">Broadcasts</Link>
        <Link href="/admin/settings" className="min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] border border-border px-4 py-2 text-sm text-on-surface">Settings</Link>
      </div>

      {/* Stats Summary */}
      <div className="mb-6 grid grid-cols-2 gap-3 shrink-0">
        <div className="rounded-[var(--radius-card)] bg-surface-container p-4 border border-border/40">
          <p className="text-[length:var(--font-size-caption)] text-on-surface-muted font-medium">Total Tenants</p>
          <p className="mt-1 text-3xl font-bold text-on-surface">{tenants.length}</p>
        </div>
        <div className="rounded-[var(--radius-card)] bg-surface-container p-4 border border-border/40">
          <p className="text-[length:var(--font-size-caption)] text-on-surface-muted font-medium">Active Tenants</p>
          <p className="mt-1 text-3xl font-bold text-brand-accent">
            {tenants.filter((t) => t.is_active).length}
          </p>
        </div>
      </div>

      {/* Search Filter */}
      <div className="relative mb-4 shrink-0">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-muted" />
        <input
          type="search"
          placeholder="Search by store name or owner"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] border border-border bg-surface pl-10 pr-3 text-[length:var(--font-size-body)] text-on-surface"
        />
      </div>

      {/* Tenant List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : filteredTenants.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-on-surface-muted gap-2">
            <ShieldAlert size={48} className="opacity-40" />
            <p className="text-[length:var(--font-size-body-lg)] font-medium">No tenants found</p>
            <p className="text-[length:var(--font-size-caption)]">Create a new tenant via user registration.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3 pb-6">
            {filteredTenants.map((tenant) => (
              <li
                key={tenant.id}
                className="rounded-[var(--radius-card)] border border-border bg-surface-container/60 p-4 transition-all duration-[var(--motion-duration-short)] flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link href={`/admin/businesses/${tenant.id}`} className="truncate text-[length:var(--font-size-body-lg)] font-semibold text-on-surface hover:text-brand-accent">{tenant.name}</Link>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${tenant.is_active
                            ? "bg-success-container text-on-success-container"
                            : "bg-danger-container text-on-danger-container"
                          }`}
                      >
                        {tenant.is_active ? <CheckCircle size={10} /> : <XCircle size={10} />}
                        {tenant.status ?? (tenant.is_active ? "verified" : "suspended")}
                      </span>
                    </div>
                    <p className="text-[length:var(--font-size-caption)] text-on-surface-muted mt-0.5">
                      Type: <span className="capitalize">{tenant.business_type.replace("_", " ")}</span>
                    </p>
                    <p className="text-[length:var(--font-size-body)] text-on-surface font-medium mt-2">
                      Owner: {tenant.owner_name}
                    </p>
                    <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
                      Registered: {formatShortDate(tenant.created_at.split("T")[0])}
                    </p>
                  </div>

                  <RippleButton
                    type="button"
                    onClick={() => toggleTenantStatus(tenant.id, tenant.is_active)}
                    disabled={togglingId === tenant.id}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${tenant.is_active
                        ? "text-danger hover:bg-danger/10"
                        : "text-brand-accent hover:bg-brand-accent/10"
                      }`}
                    title={tenant.is_active ? "Suspend Tenant" : "Activate Tenant"}
                  >
                    <Power size={18} />
                  </RippleButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
