/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { ExpirationPlugin, NetworkFirst, Serwist } from "serwist";

/**
 * Precaches the app shell so cold start on a cached 2G connection stays
 * under 3s (PRD Section 8). Serwist owns app-shell/navigation caching only.
 * The application owns outbox retries so IndexedDB is the only mutation retry
 * authority. A service-worker replay queue for /api/sync/push would create
 * duplicate ownership and can replay mutations after the UI has already
 * classified them as blocked or conflicted.
 */

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const SERVICE_WORKER_VERSION = process.env.NEXT_PUBLIC_BUILD_VERSION ?? "local";

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
        cacheName: `stockpadi-navigation-${SERVICE_WORKER_VERSION}`,
        networkTimeoutSeconds: 3,
        plugins: [new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 })],
      }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        // The static document is included in the precache. The Next route is
        // a client page and is not guaranteed to be available when the very
        // first standalone launch happens without connectivity.
        url: "/offline.html",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();

// Navigation caches are versioned so a newly deployed shell can never be
// pinned behind an older deployment. Remove only old navigation caches; the
// precache lifecycle remains owned by Serwist.
if (typeof self.addEventListener === "function") self.addEventListener("activate", (event: Event) => {
  const activateEvent = event as Event & { waitUntil?: (promise: Promise<unknown>) => void };
  if (!activateEvent.waitUntil || typeof caches === "undefined") return;
  activateEvent.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith("stockpadi-navigation-") && key !== `stockpadi-navigation-${SERVICE_WORKER_VERSION}`)
        .map((key) => caches.delete(key)),
    )),
  );
});

/**
 * Background Sync is a coordinator wake-up only. The browser client owns the
 * durable Dexie outbox, authentication, idempotency, and retry classification;
 * this worker never sends or replays a business mutation.
 */
if (typeof self.addEventListener === "function") self.addEventListener("sync", (event: Event) => {
  const syncEvent = event as Event & {
    tag?: string;
    waitUntil?: (promise: Promise<unknown>) => void;
  };
  if (syncEvent.tag !== "stockpadi-sync" || !syncEvent.waitUntil) return;
  syncEvent.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) client.postMessage({ type: "stockpadi-sync-request" });
    }),
  );
});
