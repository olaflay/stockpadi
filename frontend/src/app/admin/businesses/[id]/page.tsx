"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { callBackend } from "@/features/auth/backend-client";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";

export default function AdminBusinessDetailPage() {
  const { id } = useParams<{ id: string }>();
  const result = useLiveQuery(async () => {
    try { return await callBackend<{ business: { id: string; name: string; business_type: string; currency: string; status?: string; is_active: boolean; created_at: string } | null }>("platform-api", { action: "get_business", businessId: id }); }
    catch (error) { return { error: error instanceof Error ? error.message : "Could not load business." }; }
  }, [id]);

  if (!result) return <><ScreenHeader title="Business" /><Skeleton className="h-48" /></>;
  if ("error" in result && result.error) return <><ScreenHeader title="Business" /><ErrorState message={result.error} onRetry={() => window.location.reload()} /></>;
  const business = "business" in result ? result.business : null;
  if (!business) return <><ScreenHeader title="Business" /><ErrorState message="Business not found." onRetry={() => undefined} /></>;

  return <div className="flex flex-col gap-4"><ScreenHeader title={business.name} /><section className="rounded-[var(--radius-card)] border border-border bg-surface-container p-5"><p className="text-on-surface-muted">Status</p><p className="text-xl font-semibold text-on-surface">{business.status ?? (business.is_active ? "verified" : "suspended")}</p><p className="mt-3 text-on-surface-muted">{business.business_type} · {business.currency}</p><p className="mt-1 text-on-surface-muted">Created {new Date(business.created_at).toLocaleDateString()}</p></section><Link className="text-brand-accent" href="/admin/businesses">← Back to businesses</Link></div>;
}
