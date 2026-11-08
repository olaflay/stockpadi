import { db, BUSINESS_PROFILE_SINGLETON_ID, recoverDatabaseConnection, SESSION_SINGLETON_ID } from "@/lib/db";
import { removeLegacyTestUser } from "@/features/auth/legacy-cleanup";

export const STARTUP_ROUTE_TIMEOUT_MS = 5_000;

export type StartupDestination = "/admin" | "/verify-email" | "/dashboard" | "/onboarding" | "/login?force=true";

interface StartupRouteStore {
  removeLegacyUser: () => Promise<void>;
  getSession: () => Promise<{ userId: string; expiresAt: string } | undefined>;
  getUser: (userId: string) => Promise<{ accountType?: "ADMIN" | "BUSINESS_OWNER" | "WORKER"; emailVerified?: boolean } | undefined>;
  hasBusinessProfile: () => Promise<boolean>;
}

const localStore: StartupRouteStore = {
  removeLegacyUser: removeLegacyTestUser,
  getSession: () => db.session.get(SESSION_SINGLETON_ID),
  getUser: (userId) => db.localUsers.get(userId),
  hasBusinessProfile: async () => Boolean(await db.businessProfile.get(BUSINESS_PROFILE_SINGLETON_ID)),
};

/** Resolve the first screen only from durable local state; startup never waits for the network. */
export async function resolveStartupDestination(store: StartupRouteStore = localStore, now = Date.now()): Promise<StartupDestination> {
  await store.removeLegacyUser();
  const session = await store.getSession();
  if (!session || new Date(session.expiresAt).getTime() <= now) return "/login?force=true";

  const user = await store.getUser(session.userId);
  if (user?.accountType === "ADMIN") return "/admin";
  if (user?.accountType === "BUSINESS_OWNER" && !user.emailVerified) return "/verify-email";
  return (await store.hasBusinessProfile()) ? "/dashboard" : "/onboarding";
}

export function withStartupTimeout<T>(operation: Promise<T>, timeoutMs = STARTUP_ROUTE_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("LOCAL_WORKSPACE_TIMEOUT")), timeoutMs);
    operation.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

/** Release cross-tab IndexedDB locks and prove the database can reopen before routing again. */
export async function recoverStartupWorkspace(): Promise<boolean> {
  return recoverDatabaseConnection(STARTUP_ROUTE_TIMEOUT_MS);
}
