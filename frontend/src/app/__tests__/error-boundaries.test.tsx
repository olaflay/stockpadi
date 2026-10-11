// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import AppError from "../(app)/error";
import NotFound from "../not-found";

describe("Error boundaries and 404 recovery", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders AppError with two clear recovery actions", () => {
    const mockReset = vi.fn();
    const testError = new Error("Database offline replica timeout");

    render(<AppError error={testError} reset={mockReset} />);

    expect(screen.getByText("Something unexpected happened")).toBeDefined();

    expect(screen.getByRole("button", { name: /go back/i })).toBeDefined();
    const retryButton = screen.getByRole("button", { name: /reload/i });
    fireEvent.click(retryButton);
    expect(mockReset).toHaveBeenCalledOnce();
  });

  it("renders branded NotFound page with recovery link to POS", () => {
    render(<NotFound />);

    expect(screen.getByText("Page Not Found")).toBeDefined();
    expect(
      screen.getByText("The screen or record you requested does not exist or has been moved.")
    ).toBeDefined();

    const posLink = screen.getByRole("link", { name: /return to .* pos/i });
    expect(posLink.getAttribute("href")).toBe("/pos");
  });
});
