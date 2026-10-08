import { db, SESSION_SINGLETON_ID } from "@/lib/db";
import { getLocalBusinessId } from "@/lib/local-tenant";
import { getSupabase } from "@/lib/supabase";
import {
  recordRealtimeHint,
  recordRealtimeReconnect,
  recordSkippedPull,
} from "@/features/sync/sync-observability";
import { SYNC_HINT_EVENT, SYNC_TOPIC_PREFIX } from "./sync-realtime-contract";
import type { SyncPullTrigger } from "./preload-session-data";

interface RealtimeHint {
  type: typeof SYNC_HINT_EVENT;
  scope: string;
  cursor?: string | null;
}

export type SyncRealtimeController = (() => void) & { refresh: () => void };

function noRealtimeController(): SyncRealtimeController {
  const stop = (() => undefined) as SyncRealtimeController;
  stop.refresh = () => undefined;
  return stop;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isHint(value: unknown, topic: string): value is RealtimeHint {
  return isRecord(value)
    && value.type === SYNC_HINT_EVENT
    && value.scope === topic
    && (value.cursor === undefined || value.cursor === null || typeof value.cursor === "string");
}

function businessTopic(businessId: string): string {
  return `${SYNC_TOPIC_PREFIX}${businessId}`;
}

function branchTopic(businessId: string, branchId: string): string {
  return `${businessTopic(businessId)}:branch:${branchId}`;
}

/**
 * Owns the one browser Realtime lifecycle for synchronization. Broadcast is
 * deliberately reduced to a validated wake-up signal; all data still comes
 * from the normal authenticated cursor pull.
 */
export function startSyncRealtime(onTrigger: (trigger: SyncPullTrigger) => void): SyncRealtimeController {
  if (typeof window === "undefined") return noRealtimeController();
  const supabase = getSupabase();
  if (!supabase) return noRealtimeController();

  let stopped = false;
  let channels: ReturnType<typeof supabase.channel>[] = [];
  let subscribedTopics: string[] = [];
  let hadConnection = false;
  let configuring = false;

  const removeChannels = async (): Promise<void> => {
    const previous = channels;
    channels = [];
    subscribedTopics = [];
    await Promise.all(previous.map((channel) => supabase.removeChannel(channel)));
  };

  const handleHint = async (topic: string, message: unknown): Promise<void> => {
    const candidate = isRecord(message) && "payload" in message ? message.payload : message;
    if (!isHint(candidate, topic) || stopped) return;
    recordRealtimeHint();
    const businessId = await getLocalBusinessId();
    if (!businessId) return;
    const state = await db.syncPullState.get(`${businessId}:session`);
    const hintCursor = candidate.cursor;
    if (hintCursor && state?.lastCompletePullAt && hintCursor <= state.lastCompletePullAt) {
      recordSkippedPull();
      return;
    }
    if (state) {
      await db.syncPullState.update(state.id, {
        lastRealtimeHintAt: new Date().toISOString(),
        lastRealtimeHintCursor: hintCursor ?? null,
      });
    }
    onTrigger("realtime");
  };

  const topicsForSession = async (businessId: string): Promise<string[]> => {
    const session = await db.session.get(SESSION_SINGLETON_ID);
    const localUser = session ? await db.localUsers.get(session.userId) : undefined;
    if (localUser?.accountType === "WORKER") {
      return [...new Set((localUser.branchIds ?? []).filter(Boolean).map((branchId) => branchTopic(businessId, branchId)))];
    }
    // Business-level authorization is limited to owner/manager/accountant/admin
    // by the database policy. Branch-scoped workers only join their branch
    // topics above.
    return [businessTopic(businessId)];
  };

  const configure = async (trigger: SyncPullTrigger | null, force = false): Promise<void> => {
    if (stopped || configuring) return;
    configuring = true;
    try {
      const session = await supabase.auth.getSession();
      const businessId = await getLocalBusinessId();
      if (!session.data.session || !businessId || stopped) {
        await removeChannels();
        return;
      }
      const topics = await topicsForSession(businessId);
      if (!force && channels.length > 0 && topics.length === subscribedTopics.length && topics.every((topic) => subscribedTopics.includes(topic))) {
        if (trigger) onTrigger(trigger);
        return;
      }
      await removeChannels();
      subscribedTopics = topics;
      channels = topics.map((topic) => {
        const channel = supabase
          .channel(topic, { config: { private: true } })
          .on("broadcast", { event: SYNC_HINT_EVENT }, (message) => {
            void handleHint(topic, message);
          });
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            if (hadConnection) {
              recordRealtimeReconnect();
              onTrigger("realtime-reconnect");
            }
            hadConnection = true;
          }
        });
        return channel;
      });
      if (trigger) onTrigger(trigger);
    } finally {
      configuring = false;
    }
  };

  const authSubscription = supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      hadConnection = false;
      void removeChannels();
      return;
    }
    if (["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED", "INITIAL_SESSION"].includes(event)) {
      void configure("auth", true);
    }
  }).data.subscription;

  void configure(null, true);

  const stop = (() => {
    if (stopped) return;
    stopped = true;
    authSubscription?.unsubscribe();
    void removeChannels();
  }) as SyncRealtimeController;
  stop.refresh = () => {
    void configure(null);
  };
  return stop;
}
