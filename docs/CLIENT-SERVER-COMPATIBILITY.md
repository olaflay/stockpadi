# Client and backend compatibility

The frontend and Node API may deploy at different times. They do not need the same Git commit. The client sends `X-Client-Version`; every backend response returns `X-Build-Version` and `X-Min-Client-Version`. `GET /api/version` returns `{ "build": "…", "minClient": "…" }` and is not cached.

`clientCompatibilityVersion` in `packages/contracts/src/environment-contract.json` identifies the client request-shape compatibility line. The initial supported value is `0.1.0`. A normal UI or additive API release does not change it. A breaking request-shape change must:

1. Keep the previous client shape accepted by the backend for at least one release, using tolerant parsing or a versioned payload.
2. Add a dated entry below describing the old and new payloads and the compatibility window.
3. Add a non-destructive queued-payload upgrade when an outbox shape must change. Preserve each operation's `clientId`, `mutationId`, and `idempotencyKey`.
4. Only then advance the client compatibility version and set `MIN_CLIENT_VERSION` to the new floor when the server is ready to reject older clients.

An older client receiving a higher minimum must stop sync without changing its outbox, update its app shell, reload, and resume. A 426 response is an update signal, not a permanent mutation failure. A newer client talking to a backend that predates `/api/version` continues with the previous request contract; compatibility cannot be proven until that backend is upgraded.

Outbox payload version `1` is the current shape. Existing unversioned rows are treated as v1 and annotated by additive Dexie version 18 without changing the payload or operation identity. The backend defaults missing payload versions to v1 for older clients.

## Compatibility change log

| Client version | Change | Previous shape accepted through | Notes |
| --- | --- | --- | --- |
| 0.1.0 | Baseline compatibility headers and v1 payload annotation; no business payload shape changed. | Current release | Older rows and requests without version metadata remain accepted as v1. |

