// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import { db } from "@/lib/db";
import PurchasesPage from "../page";

const { capabilities } = vi.hoisted(() => ({ capabilities: new Set<string>() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/purchases",
}));
vi.mock("@/features/auth/use-current-user", () => ({ useCurrentUser: () => ({ id: "staff" }) }));
vi.mock("@/features/auth/authorization", () => ({ hasCapability: (_user: unknown, capability: string) => capabilities.has(capability) }));

afterEach(() => { cleanup(); capabilities.clear(); });

it.each([false, true])("shows one receive link and gates stock count (count permission: %s)", async (canCount) => {
  await db.purchases.clear();
  capabilities.add("RECEIVE_STOCK");
  if (canCount) capabilities.add("SUBMIT_STOCK_COUNT");
  render(<PurchasesPage />);
  expect(await screen.findByRole("link", { name: "Receive delivery" })).toHaveAttribute("href", "/purchases/new");
  expect(screen.getAllByRole("link", { name: "Receive delivery" })).toHaveLength(1);
  if (canCount) expect(screen.getByRole("link", { name: "Count stock" })).toHaveAttribute("href", "/stock-count");
  else expect(screen.queryByRole("link", { name: "Count stock" })).not.toBeInTheDocument();
});
