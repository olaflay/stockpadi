// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MoreSheetModal } from "../MoreSheetModal";
import type { CurrentUser } from "@/features/auth/use-current-user";

let currentUser: CurrentUser = {
  id: "owner-user",
  fullName: "Owner",
  accountType: "BUSINESS_OWNER",
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/features/auth/use-current-user", () => ({
  useCurrentUser: () => currentUser,
  hasAccountType: (user: CurrentUser, accountTypes: readonly string[]) =>
    Boolean(user.accountType && accountTypes.includes(user.accountType)),
}));

describe("MoreSheetModal navigation", () => {
  beforeEach(() => {
    currentUser = {
      id: "owner-user",
      fullName: "Owner",
      accountType: "BUSINESS_OWNER",
    };
  });

  afterEach(() => cleanup());

  it("does not repeat owner destinations already shown in the bottom navigation", () => {
    render(<MoreSheetModal isOpen onClose={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "More navigation menu" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Reports" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Products" })).toBeNull();
    expect(screen.getByRole("button", { name: "Sales" })).toBeDefined();
  });

  it("does not repeat the worker stock-count destination and sits at the safe bottom edge", () => {
    currentUser = {
      id: "worker-user",
      fullName: "Worker",
      accountType: "WORKER",
      permissions: ["SUBMIT_STOCK_COUNT", "VIEW_OWN_SALES"],
    };

    const { container } = render(<MoreSheetModal isOpen onClose={vi.fn()} />);
    const modalContainer = container.querySelector("[data-modal-container]") as HTMLElement;

    expect(screen.queryByRole("button", { name: "Stock Count" })).toBeNull();
    expect(screen.getByRole("button", { name: "Sales" })).toBeDefined();
    expect(modalContainer.className).toContain("pb-[env(safe-area-inset-bottom,0px)]");
  });
});
