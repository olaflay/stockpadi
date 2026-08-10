"use client";

import { useContext } from "react";
import type { Role } from "@/types/roles";
import { CurrentUserContext } from "@/features/auth/AuthProvider";

export interface CurrentUser {
  id: string;
  fullName: string;
  role: Role;
  emailVerified?: boolean;
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

export function hasRole(user: CurrentUser, allowed: Role[]): boolean {
  return allowed.includes(user.role);
}
