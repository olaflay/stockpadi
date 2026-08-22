"use client";

import { useContext } from "react";
import type { AccountType } from "@/features/auth/authorization";
import type { WorkerCapability } from "@/features/auth/authorization";
import { CurrentUserContext } from "@/features/auth/AuthProvider";

export interface CurrentUser {
  id: string;
  fullName: string;
  /** Deprecated cache compatibility field. Never used for authorization. */
  role?: string;
  emailVerified?: boolean;
  accountType?: AccountType;
  permissions?: WorkerCapability[];
  businessId?: string;
  branchIds?: string[];
}

/**
 * The single choke point every screen reads a role through. Backed by
 * AuthProvider (wrapping src/app/(app)/layout.tsx), which resolves the
 * cached session + local user before any authenticated screen renders, so
 * this is always a real, logged-in user by the time a screen calls it. See
 * docs/RESEARCH-AND-PLAN.md Phase 2 item 14.
 */
export function useCurrentUser(): CurrentUser {
  const user = useContext(CurrentUserContext);
  if (!user) {
    throw new Error("useCurrentUser must be used within AuthProvider (inside the (app) shell).");
  }
  return user;
}

/** Presentation-only account check. Authorization remains server/database-owned. */
export function hasAccountType(user: CurrentUser, allowed: readonly AccountType[]): boolean {
  return Boolean(user.accountType && allowed.includes(user.accountType));
}
