"use client";

import React from "react";
import Link from "next/link";
import { Menu, Store, Bell } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, BUSINESS_PROFILE_SINGLETON_ID } from "@/lib/db";
import { getBrandingConfig } from "@/config/branding";
import { useSideDrawer } from "@/components/ui/DrawerContext";
import { SyncIndicator } from "@/components/ui/SyncIndicator";
import { useAlertBadgeCount } from "@/features/alerts/use-alert-center";

export function TopStoreHeader() {
  const { openDrawer } = useSideDrawer();
  const alertCount = useAlertBadgeCount();

  const businessProfile = useLiveQuery(
    () => db.businessProfile.get(BUSINESS_PROFILE_SINGLETON_ID),
    []
  );
  const storeName = businessProfile?.name?.trim() || getBrandingConfig().businessName;

  return (
    <header
      className="sticky top-0 left-0 right-0 z-40 flex h-11 w-full items-center justify-between px-3 text-brand-accent-contrast shadow-sm select-none gpu-layer"
      style={{
        background: "linear-gradient(180deg, var(--color-brand-accent) 0%, #064e3b 100%)",
        boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.15), 0 1px 3px rgba(0, 0, 0, 0.2)",
      }}
      role="banner"
      aria-label="Store header"
    >
      {/* Left: Hamburger Drawer trigger */}
      <button
        type="button"
        onClick={openDrawer}
        aria-label="Open navigation menu"
        className="flex h-9 w-9 items-center justify-center rounded-full text-brand-accent-contrast/90 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
      >
        <Menu size={20} aria-hidden />
      </button>

      {/* Center: Store Name (Quiet, prestigious, non-distracting) */}
      <div className="flex items-center gap-1.5 min-w-0 max-w-[60%] px-2">
        <Store size={13} className="text-brand-accent-contrast/80 shrink-0" aria-hidden />
        <span
          className="truncate text-[13px] font-semibold tracking-wide text-brand-accent-contrast uppercase"
          title={storeName}
        >
          {storeName}
        </span>
      </div>

      {/* Right: Sync Indicator and Alerts */}
      <div className="flex items-center gap-1.5 shrink-0">
        <SyncIndicator compact />
        {alertCount > 0 && (
          <Link
            href="/alerts"
            aria-label={`${alertCount} unread alerts`}
            className="relative flex h-8 w-8 items-center justify-center rounded-full text-brand-accent-contrast/90 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Bell size={16} aria-hidden />
            <span className="absolute top-1 right-1 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
          </Link>
        )}
      </div>
    </header>
  );
}
