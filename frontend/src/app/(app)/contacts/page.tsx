"use client";

import { useSearchParams } from "next/navigation";
import { ContactsHubView } from "@/features/contacts/components/ContactsHubView";
import type { ContactKind } from "@/features/contacts/contacts-filter";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/Skeleton";

function ContactsContent() {
  const searchParams = useSearchParams();
  const filterParam = searchParams.get("filter") as ContactKind | null;
  const initialKind: ContactKind =
    filterParam === "debtors" ||
    filterParam === "customers" ||
    filterParam === "suppliers" ||
    filterParam === "all"
      ? filterParam
      : "all";

  return <ContactsHubView initialKind={initialKind} />;
}

export default function ContactsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4">
          <Skeleton className="h-14 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
        </div>
      }
    >
      <ContactsContent />
    </Suspense>
  );
}
