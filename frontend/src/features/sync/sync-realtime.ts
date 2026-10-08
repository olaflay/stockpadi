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

const REALTIME_RECONNECT_BASE_MS = 1_000;
const REALTIME_RECONNECT_MAX_MS = 30_000;

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
  let channelGeneration = 0;
  let reconnectTimer: number | null = null;
  let reconnectAttempt = 0;
  let queuedConfigure = false;
  let queuedConfigureForce = false;
  let queuedConfigureTrigger: SyncPullTrigger | null = null;
  let lastConnectedGeneration: number | null = null;
  let subscribedChannelCount = 0;

  const removeChannels = async (): Promise<void> => {
    channelGeneration += 1;
    const previous = channels;
    channels = [];
    subscribedTopics = [];
    await Promise.all(previous.map((channel) => supabase.removeChannel(channel)));
  };

  const clearReconnectTimer = (): void => {
    if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  };

  const scheduleReconnect = (): void => {
    if (stopped || reconnectTimer !== null) return;
    const baseDelay = Math.min(
      REALTIME_RECONNECT_MAX_MS,
      REALTIME_RECONNECT_BASE_MS * 2 ** Math.min(reconnectAttempt, 5),
    );
    reconnectAttempt += 1;
    const jitter = Math.floor(Math.random() * Math.min(2_000, Math.max(250, baseDelay * 0.25)));
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      requestConfigure("realtime-reconnect", true);
    }, baseDelay + jitter);
  };

  const handleHint = async (topic: string, message: unknown): Promise<void> => {
    const candidate = isRecord(message) && "payload" in message ? message.payload : message;
    if (!isHint(candidate, topic) || stopped) return;
    recordRealtimeHint();
    const businessId = await getLocalBusinessId();
    if (!businessId) return;
    const state = await db.syncPullState.get(`${businessId}:session`);
    const hintCursor = candidate.cursor;
    const hintTime = hintCursor ? Date.parse(hintCursor) : Number.NaN;
    const lastPullTime = state?.lastCompletePullAt ? Date.parse(state.lastCompletePullAt) : Number.NaN;
    if (hintCursor && Number.isFinite(hintTime) && Number.isFinite(lastPullTime) && hintTime <= lastPullTime) {
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
      const generation = channelGeneration;
      subscribedChannelCount = 0;
      channels = topics.map((topic) => {
        const channel = supabase
          .channel(topic, { config: { private: true } })
          .on("broadcast", { event: SYNC_HINT_EVENT }, (message) => {
            void handleHint(topic, message);
          });
        channel.subscribe((status) => {
          if (stopped || generation !== channelGeneration) return;
          if (status === "SUBSCRIBED") {
            if (lastConnectedGeneration !== generation) {
              if (hadConnection) {
                recordRealtimeReconnect();
                // A branch-scoped worker can have several channels. One
                // reconnect should produce one pull, not one pull per branch.
                onTrigger("realtime-reconnect");
              }
              lastConnectedGeneration = generation;
              subscribedChannelCount = 1;
            } else if (subscribedChannelCount < topics.length) {
              // The remaining channels are completing this generation's
              // initial subscription; they do not need separate pulls.
              subscribedChannelCount += 1;
            } else if (hadConnection) {
              // Supabase can report SUBSCRIBED again on an existing channel
              // after a transport hiccup without changing the channel object.
              recordRealtimeReconnect();
              onTrigger("realtime-reconnect");
            }
            hadConnection = true;
            if (subscribedChannelCount >= topics.length) {
              reconnectAttempt = 0;
              clearReconnectTimer();
            }
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            lastConnectedGeneration = null;
            scheduleReconnect();
          }
        });
        return channel;
      });
      if (trigger) onTrigger(trigger);
    } finally {
      configuring = false;
      if (queuedConfigure && !stopped) {
        const nextTrigger = queuedConfigureTrigger;
        const nextForce = queuedConfigureForce;
        queuedConfigure = false;
        queuedConfigureForce = false;
        queuedConfigureTrigger = null;
        void configure(nextTrigger, nextForce).catch(() => scheduleReconnect());
      }
    }
  };

  function requestConfigure(trigger: SyncPullTrigger | null, force = false): void {
    if (stopped) return;
    if (configuring) {
      queuedConfigure = true;
      queuedConfigureForce = queuedConfigureForce || force;
      queuedConfigureTrigger = trigger ?? queuedConfigureTrigger;
      return;
    }
    void configure(trigger, force).catch(() => scheduleReconnect());
  }

  const authSubscription = supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      hadConnection = false;
      clearReconnectTimer();
      void removeChannels();
      return;
    }
    if (["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED", "INITIAL_SESSION"].includes(event)) {
      requestConfigure("auth", true);
    }
  }).data.subscription;

  requestConfigure(null, true);

  const stop = (() => {
    if (stopped) return;
    stopped = true;
    clearReconnectTimer();
    authSubscription?.unsubscribe();
    void removeChannels();
  }) as SyncRealtimeController;
  stop.refresh = () => {
    requestConfigure(null);
  };
  return stop;
}
