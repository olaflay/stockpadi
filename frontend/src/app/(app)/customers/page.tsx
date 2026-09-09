"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { useDebounce } from "@/hooks/use-debounce";
import { Search, Users, MessageCircle } from "lucide-react";
import { db, BUSINESS_PROFILE_SINGLETON_ID } from "@/lib/db";
import { getAllCustomerCreditBalances, getCustomerDebtAges, getAgingBucket } from "@/features/customers/credit";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { NoResultsState } from "@/components/ui/NoResultsState";
import { formatCurrency } from "@/lib/format";
import { tenantArray } from "@/lib/local-tenant";
import type { LocalCustomer } from "@/lib/db";

/** Sorted by amount owed, descending, total owed on top. docs/RESEARCH-AND-PLAN.md Section 4.3. */
export default function CustomersPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 120);

  const businessProfile = useLiveQuery(
    () => db.businessProfile.get(BUSINESS_PROFILE_SINGLETON_ID),
    []
  );

  const [visibleLimit, setVisibleLimit] = useState(50);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const customersWithBalance = useLiveQuery(async () => {
    const [customers, balances, debtAges] = await Promise.all([
      tenantArray<LocalCustomer>(db.customers),
      getAllCustomerCreditBalances(),
      getCustomerDebtAges(),
    ]);
    const withBalances = customers.map((customer) => ({
      customer,
      balance: balances.get(customer.id) ?? 0,
      debtAgeDays: debtAges.get(customer.id) ?? 0,
    }));
    withBalances.sort((a, b) => b.balance - a.balance);
    return withBalances;
  }, []);

  const [prevQuery, setPrevQuery] = useState("");
  if (debouncedQuery !== prevQuery) {
    setPrevQuery(debouncedQuery);
    setVisibleLimit(50);
  }

  const filtered = (customersWithBalance ?? []).filter(({ customer }) =>
    `${customer.name} ${customer.phone ?? ""}`.toLowerCase().includes(debouncedQuery.toLowerCase())
  );

  useEffect(() => {
    if (filtered.length <= visibleLimit) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setVisibleLimit((prev) => prev + 50);
      }
    }, { threshold: 0.1 });

    const el = loadMoreRef.current;
    if (el) observer.observe(el);
    return () => {
      if (el) observer.unobserve(el);
    };
  }, [filtered.length, visibleLimit]);

  if (customersWithBalance === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <ScreenHeader title="Customers owing" onBack={() => router.push("/dashboard")} />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      </div>
    );
  }

  if (customersWithBalance.length === 0) {
    return (
      <div className="flex flex-col flex-1 h-full min-h-0 justify-between">
        <ScreenHeader title="Customers owing" onBack={() => router.push("/dashboard")} />
        <EmptyState
          icon={Users}
          title="No customers yet"
          description="Customers are added when you tag a sale as credit, at checkout."
          action={{ label: "Go to Sell", onClick: () => router.push("/pos") }}
        />
      </div>
    );
  }

  const totalOwed = customersWithBalance.reduce((sum, c) => sum + Math.max(c.balance, 0), 0);

  const handleQuickRemind = (e: React.MouseEvent, customer: LocalCustomer, balance: number) => {
    e.stopPropagation();
    if (!customer.phone) return;
    const shopName = businessProfile?.name ?? "StockPadi";
    const message = `Hi ${customer.name}, gentle reminder from ${shopName}. Your balance is ${formatCurrency(Math.max(balance, 0))}. Please pay when convenient. Thank you.`;
    window.open(buildWhatsAppUrl(customer.phone, message), "_blank", "noopener,noreferrer");
  };

  return (
    <div>
      <ScreenHeader title="Customers owing" onBack={() => router.push("/dashboard")} />

      <div className="mb-4 rounded-[var(--radius-focus-block)] bg-surface-container p-5">
        <p className="text-[length:var(--font-size-label)] text-on-surface-muted">Total owed to you</p>
        <p className="mt-1 font-number text-[length:var(--font-size-display)] font-semibold tabular-nums text-on-surface">
          {formatCurrency(totalOwed)}
        </p>
      </div>

      <div className="relative mb-3 w-full">
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-muted" aria-hidden />
        <input
          type="search"
          aria-label="Search customers by name or phone"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or phone"
          className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-surface-container-low pl-10 pr-3 text-[length:var(--font-size-body)] text-on-surface outline-none focus:ring-2 focus:ring-brand-accent/20"
        />
      </div>

      {filtered.length === 0 ? (
        <NoResultsState query={debouncedQuery} />
      ) : (
        <div>
          <ul className="flex flex-col gap-2">
            {filtered.slice(0, visibleLimit).map(({ customer, balance, debtAgeDays }) => {
              const aging = balance > 0 && debtAgeDays >= 0 ? getAgingBucket(debtAgeDays) : null;
              return (
                <li
                  key={customer.id}
                  className="flex items-center justify-between gap-2 rounded-[var(--radius-card)] bg-surface-container px-4 py-3 hover:bg-surface-container-high transition-colors"
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/customers/${customer.id}`)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") router.push(`/customers/${customer.id}`); }}
                    aria-label={`View customer ${customer.name}, owing ${formatCurrency(Math.max(balance, 0))}`}
                    className="min-w-0 flex-1 cursor-pointer"
                  >
                    <p className="truncate text-[length:var(--font-size-body-lg)] font-medium text-on-surface">{customer.name}</p>
                    {customer.phone && (
                      <p className="truncate text-[length:var(--font-size-caption)] text-on-surface-muted">{customer.phone}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {aging && (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[length:var(--font-size-caption)] font-medium ${aging.colorClass}`}>
                        {aging.label}
                      </span>
                    )}
                    <p
                      className={`font-number text-[length:var(--font-size-body)] font-medium tabular-nums ${balance > 0 ? "text-on-surface" : "text-on-surface-muted"
                        }`}
                    >
                      {formatCurrency(Math.max(balance, 0))}
                    </p>
                    {balance > 0 && customer.phone && (
                      <button
                        type="button"
                        onClick={(e) => handleQuickRemind(e, customer, balance)}
                        aria-label={`Send WhatsApp payment reminder to ${customer.name}`}
                        title={`Send WhatsApp reminder to ${customer.name}`}
                        className="flex h-9 w-9 items-center justify-center rounded-full text-[#25D366] hover:bg-[#25D366]/15 active:scale-90 transition-all"
                      >
                        <MessageCircle size={18} />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {filtered.length > visibleLimit && (
            <div ref={loadMoreRef} className="py-4 text-center text-sm text-on-surface-muted">
              Loading more...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
