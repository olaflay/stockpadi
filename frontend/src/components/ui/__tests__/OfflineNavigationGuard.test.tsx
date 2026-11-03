// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import Link from "next/link";
import { OfflineNavigationGuard } from "../OfflineNavigationGuard";

describe("OfflineNavigationGuard", () => {
  beforeEach(() => {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    Object.defineProperty(window.navigator, "serviceWorker", {
      configurable: true,
      value: { ready: new Promise(() => {}) },
    });
  });

  it("keeps an online-only navigation inside the app and shows an accessible dialog", () => {
    render(
      <>
        <Link href="/staff">Staff</Link>
        <OfflineNavigationGuard />
      </>,
    );

    fireEvent.click(screen.getByRole("link", { name: "Staff" }));

    expect(screen.getByRole("dialog", { name: "This page needs a connection" })).toBeInTheDocument();
    expect(screen.getByText(/currently offline/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stay here" })).toBeInTheDocument();
  });
});
