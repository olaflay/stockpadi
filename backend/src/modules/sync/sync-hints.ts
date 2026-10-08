import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../../shared/logging/logger.js";
import { supabaseAdmin } from "../../shared/supabase/client.js";

export const SYNC_HINT_EVENT = "sync_hint";
export const SYNC_TOPIC_PREFIX = "sync:business:";

export function businessSyncTopic(businessId: string): string {
  return `${SYNC_TOPIC_PREFIX}${businessId}`;
}

export function branchSyncTopic(businessId: string, branchId: string): string {
  return `${businessSyncTopic(businessId)}:branch:${branchId}`;
}

/** Queue a post-commit hint without making missing deployment config a caller error. */
export function queueSyncHints(businessId: string, branchIds: Array<string | null | undefined>): void {
  try {
    void publishSyncHints(supabaseAdmin(), businessId, branchIds);
  } catch (cause) {
    logger.error("sync hint client unavailable", { businessId, realtimePublishFailure: true }, cause);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Broadcast is a wake-up optimization only. The durable cursor pull remains
 * authoritative, so every failure here is logged and deliberately swallowed
 * after the database transaction has already committed.
 */
export async function publishSyncHints(
  db: SupabaseClient,
  businessId: string,
  branchIds: Array<string | null | undefined>,
): Promise<void> {
  try {
    await publishSyncHintsUnsafe(db, businessId, branchIds);
  } catch (cause) {
    // A test double, a missing Realtime deployment, or a transient scope
    // lookup failure must never become an unhandled rejection in the mutation
    // path. The authoritative write has already committed.
    logger.error("sync hint publication unavailable", {
      trigger: "authoritative-commit",
      businessId,
      realtimePublishFailure: true,
    }, cause);
  }
}

async function publishSyncHintsUnsafe(
  db: SupabaseClient,
  businessId: string,
  branchIds: Array<string | null | undefined>,
): Promise<void> {
  const normalizedBranches = [...new Set(branchIds.filter((branchId): branchId is string => typeof branchId === "string" && branchId.length > 0))];
  let topics = new Set<string>([businessSyncTopic(businessId)]);

  // Business-wide mutations need to wake branch-scoped workers too. A branch
  // topic carries no business data; it only tells the worker to use its own
  // authorized HTTP cursor pull.
  if (branchIds.some((branchId) => branchId == null)) {
    const { data, error } = await db.from("branches").select("id").eq("business_id", businessId).eq("is_active", true);
    if (error) {
      logger.error("sync hint branch scope lookup failed", { businessId, code: "SYNC_HINT_SCOPE_LOOKUP_FAILED" }, error);
    } else {
      for (const branch of data ?? []) {
        if (typeof branch.id === "string") normalizedBranches.push(branch.id);
      }
    }
  }
  for (const branchId of normalizedBranches) topics.add(branchSyncTopic(businessId, branchId));

  const cursor = new Date().toISOString();
  await Promise.all([...topics].map(async (topic) => {
    const channel = db.channel(topic, { config: { private: true } });
    try {
      const result = await channel.httpSend(SYNC_HINT_EVENT, {
        type: SYNC_HINT_EVENT,
        scope: topic,
        cursor,
      });
      if (!isRecord(result) || result.success !== true) {
        throw new Error(isRecord(result) && typeof result.error === "string" ? result.error : "Realtime rejected the hint");
      }
      logger.info("sync hint published", {
        trigger: "authoritative-commit",
        businessId,
        scope: topic,
        hintCount: 1,
      });
    } catch (cause) {
      logger.error("sync hint publish failed", {
        trigger: "authoritative-commit",
        businessId,
        scope: topic,
        realtimePublishFailure: true,
      }, cause);
    } finally {
      await db.removeChannel(channel);
    }
  }));
}
