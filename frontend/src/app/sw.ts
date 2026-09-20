/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { ExpirationPlugin, NetworkFirst, Serwist } from "serwist";

/**
 * Precaches the app shell so cold start on a cached 2G connection stays
 * under 3s (PRD Section 8). The application owns outbox retries so that
 * IndexedDB is the only retry authority. A service-worker replay queue for
 * /api/sync/push would create duplicate ownership and can replay mutations
 * after the UI has already classified them as blocked or conflicted.
 */

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Next's default HTML matcher keys off a request Content-Type header,
    // which navigations do not send. Explicitly cache document navigations so
    // already-warmed authenticated routes can boot without a network.
    {
      matcher: ({ request, sameOrigin }) => sameOrigin && (request.mode === "navigate" || request.headers.get("accept")?.includes("text/html") === true),
      handler: new NetworkFirst({
        cacheName: "stockpadi-navigation",
        networkTimeoutSeconds: 3,
        plugins: [new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 })],
      }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
