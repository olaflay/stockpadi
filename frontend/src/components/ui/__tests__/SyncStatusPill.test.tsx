// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { db, type SyncPullState } from "@/lib/db";
import { SyncStatusPill } from "../SyncStatusPill";

const connection = vi.hoisted(() => ({ online: true }));
vi.mock("@/lib/use-online-status", () => ({ useOnlineStatus: () => connection.online }));
vi.mock("@/features/auth/use-current-user", () => ({ useCurrentUserOptional: () => ({ businessId: "pill-fixture" }) }));

afterEach(async () => {
  cleanup();
  connection.online = true;
  await db.syncPullState.clear();
});

it("shows automatic recovery as pending and clears the warning in place after success", async () => {
  const id = "pill-fixture:session";
  await db.syncPullState.put({
    id, businessId: "pill-fixture", lastPullStatus: "failed",
    nextPullAttemptAt: "2026-11-28T12:00:00Z",
  } as SyncPullState);
  render(<SyncStatusPill />);
  expect(await screen.findByRole("link", { name: "Sync status: Pending" })).toBeInTheDocument();
  await act(() => db.syncPullState.update(id, { lastPullStatus: "success", nextPullAttemptAt: null, lastCompletePullAt: "2026-11-28T11:59:00Z" }));
  expect(await screen.findByRole("link", { name: "Sync status: Saved" })).toBeInTheDocument();
});

it("keeps a durable sync failure accessible from the header", async () => {
  await db.syncPullState.put({ id: "pill-fixture:session", businessId: "pill-fixture", lastPullStatus: "failed" } as SyncPullState);
  const { rerender } = render(<SyncStatusPill />);
  const review = await screen.findByRole("link", { name: "Sync status: Review" });
  expect(review).toHaveAttribute("href", "/settings/sync-health");
  expect(review.querySelector(".bg-danger")).not.toBeNull();
  connection.online = false;
  rerender(<SyncStatusPill />);
  expect(screen.getByRole("link", { name: /Sync status: Offline/ })).toBeInTheDocument();
});
