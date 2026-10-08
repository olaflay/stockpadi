import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publishSyncHints } from "./sync-hints.js";

function fakeDatabase(branches: string[]) {
  const sent: Array<{ topic: string; event: string; payload: Record<string, unknown> }> = [];
  const channels = new Map<string, { httpSend: ReturnType<typeof vi.fn> }>();
  const query: Record<string, unknown> & { then?: (resolve: (value: unknown) => unknown) => unknown } = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.then = (resolve) => resolve({ data: branches.map((id) => ({ id })), error: null });
  const db = {
    from: vi.fn(() => query),
    channel: vi.fn((topic: string) => {
      const channel = { httpSend: vi.fn(async (event: string, payload: Record<string, unknown>) => {
        sent.push({ topic, event, payload });
        return { success: true as const };
      }) };
      channels.set(topic, channel);
      return channel;
    }),
    removeChannel: vi.fn(async () => "ok"),
  } as unknown as SupabaseClient;
  return { db, sent, channels };
}

describe("publishSyncHints", () => {
  it("publishes only a thin business and requested branch hint", async () => {
    const { db, sent } = fakeDatabase(["branch-a", "branch-b"]);

    await publishSyncHints(db, "business-a", ["branch-a"]);

    expect(sent.map((message) => message.topic).sort()).toEqual([
      "sync:business:business-a",
      "sync:business:business-a:branch:branch-a",
    ]);
    expect(sent.every((message) => message.event === "sync_hint" && message.payload.type === "sync_hint" && message.payload.scope === message.topic)).toBe(true);
    expect(sent.every((message) => !("records" in message.payload))).toBe(true);
  });

  it("fans a business-wide hint out to active branch scopes for workers", async () => {
    const { db, sent } = fakeDatabase(["branch-a", "branch-b"]);

    await publishSyncHints(db, "business-a", [null]);

    expect(sent.map((message) => message.topic).sort()).toEqual([
      "sync:business:business-a",
      "sync:business:business-a:branch:branch-a",
      "sync:business:business-a:branch:branch-b",
    ]);
  });
});
