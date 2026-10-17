/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist } from "serwist";

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
const SERVICE_WORKER_CACHE_ID = `stockpadi-${SERVICE_WORKER_VERSION}`;
const NAVIGATION_CACHE = `stockpadi-navigation-${SERVICE_WORKER_VERSION}`;
const STATIC_CACHE = `stockpadi-static-${SERVICE_WORKER_VERSION}`;

const LEGACY_APP_CACHES = new Set([
  "google-fonts-webfonts",
  "google-fonts-stylesheets",
  "static-font-assets",
  "static-image-assets",
  "next-static-js-assets",
  "next-image",
  "static-audio-assets",
  "static-video-assets",
  "static-js-assets",
  "static-style-assets",
  "next-data",
  "static-data-assets",
  "apis",
  "pages-rsc-prefetch",
  "pages-rsc",
  "pages",
]);

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  cacheId: SERVICE_WORKER_CACHE_ID,
  // A waiting worker is activated by the page only at a safe point or after
  // the user chooses to update. The outbox itself remains in IndexedDB.
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // API and sync responses may contain tenant data and must always use the
      // network. Mutation replay belongs exclusively to the durable outbox.
      matcher: ({ sameOrigin, url: { pathname } }) =>
        sameOrigin && (pathname === "/api" || pathname.startsWith("/api/") || pathname === "/sync" || pathname.startsWith("/sync/")),
      handler: new NetworkOnly(),
    },
    {
      matcher: ({ sameOrigin, url: { pathname } }) => sameOrigin && pathname.startsWith("/_next/static/"),
      handler: new CacheFirst({
        cacheName: STATIC_CACHE,
        plugins: [new ExpirationPlugin({ maxEntries: 256, maxAgeSeconds: 365 * 24 * 60 * 60 })],
      }),
    },
    // Next's default HTML matcher keys off a request Content-Type header,
    // which navigations do not send. Explicitly cache document navigations so
    // already-warmed authenticated routes can boot without a network.
    // networkTimeoutSeconds is bounded to 0.8s so cold start on dead 2G/3G
    // does not hang the cashier's screen for 3 seconds before cache fallback.
    {
      matcher: ({ request, sameOrigin }) => sameOrigin && (request.mode === "navigate" || request.headers.get("accept")?.includes("text/html") === true),
      handler: new NetworkFirst({
        cacheName: NAVIGATION_CACHE,
        networkTimeoutSeconds: 0.8,
        plugins: [new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 })],
      }),
    },
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

// Clean up only Cache Storage entries owned by this app. IndexedDB (including
// every domain table and pending outbox operation) is never touched here.
if (typeof self.addEventListener === "function") self.addEventListener("activate", (event: Event) => {
  const activateEvent = event as Event & { waitUntil?: (promise: Promise<unknown>) => void };
  if (!activateEvent.waitUntil || typeof caches === "undefined") return;
  activateEvent.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => {
          const isCurrent = key === NAVIGATION_CACHE || key === STATIC_CACHE || key.startsWith(`${SERVICE_WORKER_CACHE_ID}-`);
          const isOwnedVersionedCache = key.startsWith("stockpadi-navigation-") || key.startsWith("stockpadi-static-") || key.startsWith("stockpadi-");
          const isLegacySerwistCache = key === `serwist-precache-v2-${self.registration.scope}`;
          return !isCurrent && (isOwnedVersionedCache || LEGACY_APP_CACHES.has(key) || isLegacySerwistCache);
        })
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
