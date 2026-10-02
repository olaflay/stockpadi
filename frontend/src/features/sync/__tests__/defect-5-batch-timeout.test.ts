import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { setLocalBusinessId } from "@/lib/local-tenant";

/**
 * DEFECT 5 — an oversized outbox batch cannot drain inside the client timeout.
 *
 * The client pushes up to DRAIN_BATCH_SIZE (500) items in one request and
 * aborts that request at REQUEST_TIMEOUT_MS (15s). The backend applies a batch
 * sequentially, one RPC round trip per item, so serving time grows with the
 * number of items in it. A batch needing more than 15 seconds of server work
 * never returns its per-item acknowledgements.
 *
 * When the abort fires the server may already have applied part of the batch,
 * but the client never learns which part, so it must lose nothing and confirm
 * nothing. These tests drive the abort exactly as production observes it:
 * server-client's AbortController fires, fetch rejects with an AbortError, and
 * server-client converts that into NetworkUnavailableError before drain-outbox
 * ever sees a response.
 *
 * Resending is safe for integrity because every item carries a stable
 * idempotency_key, so already-applied items come back as "skipped" rather than
 * applying twice. The remaining consequence is liveness, not corruption: a queue
 * too large to serve inside the timeout re-sends the same oversized slice on
 * every attempt and never drains. That is an open question, because the remedy
 * is a sizing policy decision rather than a local correctness fix.
 */

let mockSession: { access_token: string } | null = null;

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    auth: { getSession: () => Promise.resolve({ data: { session: mockSession } }) },
  }),
}));

const BUSINESS_ID = "test-business";

async function queueItems(count: number, prefix = "item") {
  await db.outbox.bulkAdd(
    Array.from({ length: count }, (_, i) => ({
      clientId: `${prefix}-${i}`,
      type: "sale",
      payload: { id: `${prefix}-${i}` },
      createdAtLocal: "2026-03-01T10:00:00.000Z",
      status: "pending" as const,
      attemptCount: 0,
      lastError: null,
      businessId: BUSINESS_ID,
    }))
  );
}

/** Records the batch it was handed, then behaves as an aborted request. */
function abortingFetch() {
  const batches: Array<Array<{ idempotency_key: string; client_id: string }>> = [];
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    batches.push(JSON.parse(String(init.body)).batch);
    throw new DOMException("aborted", "AbortError");
  });
  return { fetchMock, batches };
}

/** Clears the retry backoff so a parked item is eligible on the next drain. */
async function clearBackoff() {
  const rows = await db.outbox.toArray();
  await db.outbox.bulkUpdate(
    rows.map((row) => ({ key: row.clientId, changes: { nextAttemptAt: null } }))
  );
}

describe("DEFECT 5: batch push that outlives the client timeout", () => {
  beforeEach(async () => {
    await setLocalBusinessId(BUSINESS_ID);
    await Promise.all(db.tables.map((table) => table.clear()));
    mockSession = { access_token: "test-token" };
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps every queued item when the request aborts mid-batch", async () => {
    await queueItems(500);
    const { fetchMock } = abortingFetch();
    vi.stubGlobal("fetch", fetchMock);

    const { drainOutbox } = await import("@/features/sync/drain-outbox");
    await drainOutbox();

    expect(await db.outbox.toArray()).toHaveLength(500);
  });

  it("leaves timed-out items retryable rather than failed", async () => {
    await queueItems(3, "sale");
    const { fetchMock } = abortingFetch();
    vi.stubGlobal("fetch", fetchMock);

    const { drainOutbox } = await import("@/features/sync/drain-outbox");
    await drainOutbox();

    const remaining = await db.outbox.toArray();
    expect(remaining).toHaveLength(3);
    for (const item of remaining) {
      expect(item.status).toBe("pending");
      // Recorded as a network problem, not a server rejection.
      expect(item.errorCode).toBe("NETWORK_UNAVAILABLE");
    }
  });

  it("resends identical idempotency keys so the server can dedupe", async () => {
    await queueItems(2, "sale");
    const { fetchMock, batches } = abortingFetch();
    vi.stubGlobal("fetch", fetchMock);

    const { drainOutbox } = await import("@/features/sync/drain-outbox");
    await drainOutbox();
    await clearBackoff();
    await drainOutbox();

    expect(batches).toHaveLength(2);
    expect(batches[1].map((i) => i.idempotency_key).sort()).toEqual(
      batches[0].map((i) => i.idempotency_key).sort()
    );
  });

  it("repeats the same oversized slice, which is why the queue never drains", async () => {
    await queueItems(500);
    const { fetchMock, batches } = abortingFetch();
    vi.stubGlobal("fetch", fetchMock);

    const { drainOutbox } = await import("@/features/sync/drain-outbox");
    for (let attempt = 0; attempt < 3; attempt++) {
      await drainOutbox();
      await clearBackoff();
    }

    // Every attempt re-sends the slice up to DRAIN_BATCH_SIZE (100): nothing is lost and nothing is
    // confirmed, so the operator sees a permanently growing pending count.
    expect(batches).toHaveLength(3);
    for (const batch of batches) expect(batch).toHaveLength(100);
    expect(await db.outbox.count()).toBe(500);
  });

  it("parks acknowledged items awaiting confirmation instead of deleting them", async () => {
    await queueItems(3, "sale");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const batch = JSON.parse(String(init.body)).batch;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            results: batch.map((item: { client_id: string }) => ({
              clientId: item.client_id,
              status: "applied",
            })),
          }),
        };
      })
    );

    const { drainOutbox } = await import("@/features/sync/drain-outbox");
    await drainOutbox();

    // Acknowledged rows are held for the next pull to confirm rather than
    // deleted, which is what makes a sale recoverable if the pull never lands.
    const parked = await db.outbox.where("status").equals("syncing").toArray();
    expect(parked).toHaveLength(3);
    expect(parked.every((row) => row.awaitingConfirmation)).toBe(true);
  });
});