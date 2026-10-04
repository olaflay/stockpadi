"use client";

import { useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Plus,
  Users,
  MessageCircle,
  Clock,
  UserCheck,
  MessageSquare,
} from "lucide-react";
import { db, BUSINESS_PROFILE_SINGLETON_ID } from "@/lib/db";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { NoResultsState } from "@/components/ui/NoResultsState";
import { RippleButton } from "@/components/ui/Ripple";
import { SearchBar } from "@/components/ui/SearchBar";
import { formatCurrency } from "@/lib/format";
import { formatDisplayPhone } from "@/lib/phone";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { getAgingBucket } from "@/features/customers/credit";
import { getBrandingConfig } from "@/config/branding";
import { useDebounce } from "@/hooks/use-debounce";
import {
  computeCounts,
  filterContacts,
  type ContactKind,
  type ContactRow,
} from "../contacts-filter";
import { loadContactsHubRows } from "../contacts-view";
import { AddContactModal } from "./AddContactModal";
import { ContactDetailModal } from "./ContactDetailModal";
import { DebtorMessageModal } from "./DebtorMessageModal";
import { SendDebtorReminderModal } from "./SendDebtorReminderModal";

interface ContactsHubViewProps {
  initialKind?: ContactKind;
  backHref?: string;
}

export function ContactsHubView({
  initialKind = "debtors",
  backHref = "/more",
}: ContactsHubViewProps) {
  const [kind, setKind] = useState<ContactKind>(initialKind);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebounce(searchQuery, 120);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<ContactRow | null>(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [reminderDebtor, setReminderDebtor] = useState<ContactRow | null>(null);

  const branding = getBrandingConfig();

  const businessProfile = useLiveQuery(
    () => db.businessProfile.get(BUSINESS_PROFILE_SINGLETON_ID),
    []
  );
  const shopName = businessProfile?.name?.trim() || branding.businessName;

  const contactsData = useLiveQuery(() => loadContactsHubRows(), []);

  const counts = useMemo(() => {
    return computeCounts(contactsData ?? []);
  }, [contactsData]);

  const filteredContacts = useMemo(() => {
    return filterContacts(contactsData ?? [], kind, debouncedQuery);
  }, [contactsData, kind, debouncedQuery]);

  const totalOwed = useMemo(() => {
    return (contactsData ?? []).reduce(
      (sum, c) => sum + Math.max(c.balance, 0),
      0
    );
  }, [contactsData]);

  function handleNonDebtorWhatsApp(e: React.MouseEvent, contact: ContactRow) {
    e.stopPropagation();
    if (!contact.phone) return;

    let message: string;
    if (contact.kinds.includes("supplier")) {
      message = `Hello ${contact.name}, this is ${shopName} reaching out regarding inventory supply.`;
    } else {
      message = `Hello ${contact.name}, thank you for shopping at ${shopName}!`;
    }

    window.open(buildWhatsAppUrl(contact.phone, message), "_blank", "noopener,noreferrer");
  }

  if (contactsData === undefined) {
    return (
      <div className="flex flex-col gap-4 pb-20">
        <ScreenHeader title="Contacts & Debtors" backHref={backHref} />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14 rounded-2xl" />
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
        </div>
      </div>
    );
  }

  // Prioritize "Who Owes You" as the primary retention action tab
  const chips: { key: ContactKind; label: string; count: number }[] = [
    { key: "debtors", label: "Who Owes You", count: counts.debtors },
    { key: "customers", label: "Customers", count: counts.customers },
    { key: "suppliers", label: "Suppliers", count: counts.suppliers },
    { key: "all", label: "All Contacts", count: counts.all },
  ];

  return (
    <div className="flex flex-col gap-4 pb-28">
      {/* Header with Add Contact shortcut */}
      <ScreenHeader
        title="Contacts & Debtors"
        backHref={backHref}
        action={
          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-brand-accent px-3 py-1.5 text-xs font-semibold text-brand-accent-contrast shadow-xs hover:opacity-90 active:scale-95 transition-all"
            aria-label="Add contact"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Add Contact</span>
          </button>
        }
      />

      {/* Total Owed Highlight Banner & Template Shortcut */}
      {(kind === "debtors" || counts.debtors > 0) && totalOwed > 0 && (
        <div className="flex flex-col gap-2.5 rounded-2xl bg-danger-container/20 p-4 border border-danger/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-on-surface-muted">
                Money outside (Customer debt)
              </p>
              <p className="mt-0.5 font-number text-2xl font-bold tabular-nums text-danger">
                {formatCurrency(totalOwed)}
              </p>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2.5 py-1 text-xs font-semibold text-danger">
                <Users size={14} />
                <span>{counts.debtors} owing</span>
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-danger/15 flex items-center justify-between gap-2">
            <span className="text-[11px] text-on-surface-muted truncate">
              Debtor reminder template:
            </span>
            <button
              type="button"
              onClick={() => setTemplateModalOpen(true)}
              className="shrink-0 inline-flex items-center gap-1 rounded-full bg-surface-container px-2.5 py-1 text-xs font-semibold text-brand-accent hover:bg-surface-container-high transition-colors"
            >
              <MessageSquare size={13} />
              <span>Edit Reminder Message</span>
            </button>
          </div>
        </div>
      )}

      {/* Search Input */}
      <SearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search by name or phone number..."
        ariaLabel="Search contacts by name or phone"
      />

      {/* Segmented Filter Chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {chips.map((chip) => {
          const isSelected = kind === chip.key;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => setKind(chip.key)}
              aria-pressed={isSelected}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                isSelected
                  ? "bg-brand-accent text-brand-accent-contrast shadow-xs"
                  : "bg-surface-container text-on-surface hover:bg-surface-container-high"
              }`}
            >
              <span>{chip.label}</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                  isSelected
                    ? "bg-white/20 text-white"
                    : "bg-surface-container-highest text-on-surface-muted"
                }`}
              >
                {chip.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Contacts List / Empty States */}
      {contactsData.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No contacts yet"
          description="Save your regular customers, debtors, and wholesale suppliers to keep all relationships in one place."
          action={{
            label: "Add First Contact",
            onClick: () => setAddModalOpen(true),
          }}
        />
      ) : filteredContacts.length === 0 ? (
        <NoResultsState query={debouncedQuery} />
      ) : (
        <ul className="divide-y divide-outline-variant/30 rounded-3xl bg-surface-container/60 border border-outline-variant/30 overflow-hidden shadow-xs">
          {filteredContacts.map((contact) => {
            const isDebtor = contact.balance > 0;
            const aging =
              isDebtor && (contact.debtAgeDays ?? 0) >= 0
                ? getAgingBucket(contact.debtAgeDays ?? 0)
                : null;

            return (
              <li key={contact.id} className="transition-colors hover:bg-surface-container-high/40">
                <RippleButton
                  type="button"
                  onClick={() => setSelectedContact(contact)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors"
                >
                  {/* Left: Avatar & Info */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-container-high text-on-surface font-bold text-sm">
                      {contact.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-on-surface">
                          {contact.name}
                        </p>
                        {/* Kind Badges */}
                        {contact.kinds.includes("supplier") && (
                          <span className="shrink-0 inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.2 text-[10px] font-semibold text-primary">
                            Supplier
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-on-surface-muted font-number mt-0.5">
                        {contact.phone
                          ? formatDisplayPhone(contact.phone)
                          : "No phone recorded"}
                      </p>
                    </div>
                  </div>

                  {/* Right: Debt amount or action */}
                  <div className="flex shrink-0 items-center gap-2">
                    {isDebtor ? (
                      <div className="flex flex-col items-end">
                        <span className="font-number text-sm font-bold tabular-nums text-danger">
                          {formatCurrency(contact.balance)}
                        </span>
                        {aging && (
                          <span
                            className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.2 text-[10px] font-medium ${aging.colorClass}`}
                          >
                            <Clock size={10} />
                            <span>{aging.label}</span>
                          </span>
                        )}
                      </div>
                    ) : contact.kinds.includes("supplier") ? (
                      <span className="text-xs text-on-surface-muted">
                        Supplier
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-brand-accent">
                        <UserCheck size={14} />
                        <span>Customer</span>
                      </span>
                    )}

                    {/* WhatsApp Action: opens reminder modal for debtors, direct WhatsApp for others */}
                    {contact.phone && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isDebtor) {
                            setReminderDebtor(contact);
                          } else {
                            handleNonDebtorWhatsApp(e, contact);
                          }
                        }}
                        aria-label={`WhatsApp ${contact.name}`}
                        title={
                          isDebtor
                            ? `Send customizable WhatsApp reminder to ${contact.name}`
                            : `Message ${contact.name} on WhatsApp`
                        }
                        className="flex h-9 w-9 items-center justify-center rounded-full text-[#25D366] hover:bg-[#25D366]/15 active:scale-90 transition-all"
                      >
                        <MessageCircle size={18} />
                      </button>
                    )}
                  </div>
                </RippleButton>
              </li>
            );
          })}
        </ul>
      )}

      {/* Floating Action Button (FAB) for mobile ergonomics */}
      <div className="fixed bottom-20 right-4 z-30 sm:hidden">
        <button
          type="button"
          onClick={() => setAddModalOpen(true)}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-accent text-brand-accent-contrast shadow-lg hover:scale-105 active:scale-95 transition-all"
          aria-label="Add new contact"
        >
          <Plus size={24} />
        </button>
      </div>

      {/* Modals */}
      <AddContactModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSaved={() => {
          // Dexie live query will update automatically
        }}
        defaultKind={kind === "suppliers" ? "supplier" : "customer"}
      />

      <ContactDetailModal
        contact={selectedContact}
        isOpen={Boolean(selectedContact)}
        onClose={() => setSelectedContact(null)}
        businessName={shopName}
        owingMessageTemplate={businessProfile?.owingMessageTemplate}
        onSendDebtorReminder={(contact) => setReminderDebtor(contact)}
      />

      <DebtorMessageModal
        isOpen={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        currentTemplate={businessProfile?.owingMessageTemplate}
        businessName={shopName}
      />

      <SendDebtorReminderModal
        contact={reminderDebtor}
        isOpen={Boolean(reminderDebtor)}
        onClose={() => setReminderDebtor(null)}
        businessName={shopName}
        template={businessProfile?.owingMessageTemplate}
        onOpenTemplateEditor={() => setTemplateModalOpen(true)}
      />
    </div>
  );
}
