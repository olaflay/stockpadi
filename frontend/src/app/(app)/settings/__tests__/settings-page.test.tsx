// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import SettingsPage from "../page";
import type { CurrentUser } from "@/features/auth/use-current-user";

const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockSignOut = vi.fn();

let currentUser: CurrentUser = {
  id: "user-owner",
  fullName: "Alhaji Bello",
  accountType: "BUSINESS_OWNER",
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  usePathname: () => "/settings",
}));

vi.mock("@/features/auth/use-current-user", () => ({
  useCurrentUser: () => currentUser,
  hasAccountType: (user: CurrentUser, allowed: readonly string[]) =>
    allowed.includes(user.accountType ?? ""),
}));

vi.mock("@/features/settings/use-theme", () => ({
  useTheme: () => ({
    theme: "system",
    setTheme: vi.fn(),
  }),
}));

vi.mock("@/features/auth/logout", () => ({
  signOut: () => mockSignOut(),
}));

vi.mock("@/components/ui/Ripple", () => ({
  useRipple: () => ({
    ripples: [],
    onPointerDown: vi.fn(),
  }),
  RippleLayer: () => null,
  RippleButton: ({ children, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
  RippleLink: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("SettingsPage component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = {
      id: "user-owner",
      fullName: "Alhaji Bello",
      accountType: "BUSINESS_OWNER",
    };
  });

  afterEach(() => {
    cleanup();
  });

  it("renders profile surface with owner role badge and management sections", () => {
    render(<SettingsPage />);

    expect(screen.getByText("Alhaji Bello")).toBeDefined();
    expect(screen.getByText("Owner")).toBeDefined();

    // Owner management sections are visible
    expect(screen.getByText("People & Permissions")).toBeDefined();
    expect(screen.getByText("Staff & access")).toBeDefined();
    expect(screen.getByText("Business profile")).toBeDefined();
    expect(screen.getByText("Branches & outlets")).toBeDefined();

    // Data & Support sections
    expect(screen.getByText("Data & Sharing")).toBeDefined();
    expect(screen.getByText("Backup & offline data")).toBeDefined();
    expect(screen.getByText("Sync health")).toBeDefined();
    expect(screen.getByText("Help & Support")).toBeDefined();
    expect(screen.getByText("App Walkthrough")).toBeDefined();
  });

  it("hides owner-only people, store, and data sections for staff workers", () => {
    currentUser = {
      id: "user-worker",
      fullName: "Kemi Ade",
      accountType: "WORKER",
      permissions: ["POS_SELL"],
    };

    render(<SettingsPage />);

    expect(screen.getByText("Kemi Ade")).toBeDefined();
    expect(screen.getByText("Staff")).toBeDefined();

    // Team and Business management must not be rendered for worker
    expect(screen.queryByText("People & Permissions")).toBeNull();
    expect(screen.queryByText("Staff & access")).toBeNull();
    expect(screen.queryByText("Business profile")).toBeNull();
    expect(screen.queryByText("Data & Sharing")).toBeNull();

    // Display and Support sections remain accessible
    expect(screen.getByText("Display")).toBeDefined();
    expect(screen.getByText("Help & Support")).toBeDefined();
    expect(screen.getByText("App Walkthrough")).toBeDefined();
  });

  it("triggers signOut and routes to login on sign out tap", async () => {
    mockSignOut.mockResolvedValueOnce(undefined);
    render(<SettingsPage />);

    const logoutButton = screen.getByRole("button", { name: /log out/i });
    fireEvent.click(logoutButton);

    expect(mockSignOut).toHaveBeenCalledOnce();
    await vi.waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/login?force=true");
    });
  });
});
