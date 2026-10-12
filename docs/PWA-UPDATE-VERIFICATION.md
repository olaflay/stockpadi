# PWA update verification

The service worker owns app-shell caching only. IndexedDB and its outbox are never cleared, reset, renamed, or re-keyed during an update. Updates activate automatically. The page waits for an idle sync/request/form moment for at most 7.5 seconds, captures non-sensitive form values in a dedicated sessionStorage key, and reloads. The existing `stockpadi-cart` draft is not touched. If an update repeatedly fails, the user gets a persistent `Update now` fallback. A blocked IndexedDB upgrade asks them to close other app tabs and continues when the database becomes available.

## Manual release checklist

1. **Two consecutive deployments with the app left open:** Install/launch release A, leave a tab and an installed Android PWA open, deploy release B, and confirm each updates without a hard refresh. Repeat B to C without closing either client. Check `/sw.js` has no-cache headers and the active worker/cache name matches the deployed build.
2. **Pending offline sale:** Disable network, complete a sale, confirm its outbox row and client-generated operation identity in IndexedDB, deploy a new release, then reconnect. Confirm the sale remains in the outbox through reload and is acknowledged exactly once on the server. Confirm the stock movement and credit ledger are each present once.
3. **Open cart across update:** Add products and a discount, trigger an update while leaving checkout open, and confirm the cart, payment inputs that are safe to preserve, and non-sensitive form values return after automatic reload. Passwords and authentication codes must not be saved.
4. **Stale screens:** Keep inventory, sales, customer, alert, and report screens open on one device. Change data from a second authorized device, reconnect or focus the first device, and confirm a cursor pull updates the Dexie-backed screens without manual refresh. Failed pulls must remain visibly unverified rather than being presented as current.
5. **Chrome desktop:** Repeat deployment/update, version mismatch (426), focus, reconnect, and open-tab/blocked-database checks in Chrome. Verify update retries are bounded and do not repeatedly reload the same build.
6. **Installed Android PWA:** Repeat on a low-memory Android device with Chrome; test app backgrounding, process kill/reopen, offline launch, pending outbox, and return from background. Confirm the cart and pending operation survive.
7. **Compatibility window:** Test an old client against a new backend with a higher `MIN_CLIENT_VERSION` (sync pauses, the outbox remains unchanged, and update resumes sync), then a new client against an old backend (old request shape continues safely; `/api/version` may return 404).

## Automated evidence

Unit tests cover update activation despite an existing cart draft, non-sensitive form draft restore, compatibility-floor handling, and old-server fallback. Backend tests cover version metadata and 426 behavior. Automated browser/device tests for installed Android, real two-device Realtime/pull convergence, process termination, and a blocked multi-tab IndexedDB upgrade still require the manual checklist above.
