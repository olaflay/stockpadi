import { db, SESSION_SINGLETON_ID } from "@/lib/db";

const LEGACY_TEST_USER_ID = "00000000-0000-0000-0000-000000000001";

/** Removes the old development bypass account from devices that used it. */
export async function removeLegacyTestUser(): Promise<void> {
  await db.localUsers.delete(LEGACY_TEST_USER_ID);
  const session = await db.session.get(SESSION_SINGLETON_ID);
  if (session?.userId === LEGACY_TEST_USER_ID) await db.session.delete(SESSION_SINGLETON_ID);
}
