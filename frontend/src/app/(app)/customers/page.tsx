"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Search, Users } from "lucide-react";
import { db } from "@/lib/db";
import { getAllCustomerCreditBalances } from "@/features/customers/credit";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { NoResultsState } from "@/components/ui/NoResultsState";
import { formatCurrency } from "@/lib/format";
import { fetchServerCustomers } from "@/features/customers/customer-client";
import { tenantArray } from "@/lib/local-tenant";
import type { LocalCustomer } from "@/lib/db";

/** Sorted by amount owed, descending, total owed on top. docs/RESEARCH-AND-PLAN.md Section 4.3. */
export default function CustomersPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const customersWithBalance = useLiveQuery(async () => {
    let customers;
    let balances;
    try {
      const remote = await fetchServerCustomers();
      customers = remote.customers.map((customer) => ({ id: customer.id, name: customer.name, phone: customer.phone, updatedAt: customer.updated_at }));
      balances = new Map(remote.customers.map((customer) => [customer.id, customer.balance]));
    } catch {
      [customers, balances] = await Promise.all([tenantArray<LocalCustomer>(db.customers), getAllCustomerCreditBalances()]);
    }
    const withBalances = customers.map((customer) => ({ customer, balance: balances.get(customer.id) ?? 0 }));
    withBalances.sort((a, b) => b.balance - a.balance);
    return withBalances;
  }, []);

  if (customersWithBalance === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <ScreenHeader title="Customers Owing" onBack={() => router.push("/dashboard")} />
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
      <div className="flex min-h-[calc(100vh-140px)] flex-col">
        <ScreenHeader title="Customers Owing" onBack={() => router.push("/dashboard")} />
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={Users}
            title="No customers yet"
            description="Customers are added when you tag a sale as credit, at checkout."
            action={{ label: "Go to Sell", onClick: () => router.push("/pos") }}
          />
        </div>
      </div>
    );
  }

  const totalOwed = customersWithBalance.reduce((sum, c) => sum + Math.max(c.balance, 0), 0);
  const filtered = customersWithBalance.filter(({ customer }) =>
    `${customer.name} ${customer.phone ?? ""}`.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div>
      <ScreenHeader title="Customers Owing" onBack={() => router.push("/dashboard")} />

      <div className="mb-4 rounded-[var(--radius-focus-block)] bg-surface-container p-5">
        <p className="text-[length:var(--font-size-label)] text-on-surface-muted">Total owed to you</p>
        <p className="mt-1 text-[length:var(--font-size-display)] font-semibold text-on-surface">
          {formatCurrency(totalOwed)}
        </p>
      </div>

      <div className="relative mb-3 w-full">
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-muted" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or phone"
          className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] border border-border bg-surface pl-10 pr-3 text-[length:var(--font-size-body)] text-on-surface"
        />
      </div>

      {filtered.length === 0 ? (
        <NoResultsState query={query} />
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map(({ customer, balance }) => (
            <li key={customer.id}>
              <button
                type="button"
                onClick={() => router.push(`/customers/${customer.id}`)}
                className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-card)] border border-border bg-surface px-4 py-3 text-left hover:bg-surface-container transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[length:var(--font-size-body-lg)] text-on-surface">{customer.name}</p>
                  {customer.phone && (
                    <p className="truncate text-[length:var(--font-size-caption)] text-on-surface-muted">{customer.phone}</p>
                  )}
                </div>
                <p
                  className={`shrink-0 text-[length:var(--font-size-body)] font-medium ${
                    balance > 0 ? "text-on-surface" : "text-on-surface-muted"
                  }`}
                >
                  {formatCurrency(Math.max(balance, 0))}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
