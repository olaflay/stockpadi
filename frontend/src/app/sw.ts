/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { BackgroundSyncPlugin, NetworkOnly, Serwist } from "serwist";

/**
 * Precaches the app shell so cold start on a cached 2G connection stays
 * under 3s (PRD Section 8). Background Sync drains the sync outbox on
 * reconnect per the lifecycle in .agents/rules/offline-sync-and-ledger.md
 * and PRD Section 10.1, even if the app isn't in the foreground.
 */

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const SYNC_QUEUE_NAME = "stockpadi-outbox";

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    ...defaultCache,
    {
      matcher: ({ url }) => url.pathname.startsWith("/functions/v1/sync-push"),
      handler: new NetworkOnly({
        plugins: [
          new BackgroundSyncPlugin(SYNC_QUEUE_NAME, {
            maxRetentionTime: 24 * 60, // minutes; matches the 24h "needs attention" threshold in PRD 10.1
          }),
        ],
      }),
    },
  ],
});

serwist.addEventListeners();
