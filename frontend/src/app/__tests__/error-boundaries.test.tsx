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

  it("renders AppError with error details and reset retry action", () => {
    const mockReset = vi.fn();
    const testError = new Error("Database offline replica timeout");

    render(<AppError error={testError} reset={mockReset} />);

    expect(screen.getByText("Something unexpected happened")).toBeDefined();

    const retryButton = screen.getByRole("button", { name: /try again/i });
    fireEvent.click(retryButton);
    expect(mockReset).toHaveBeenCalledOnce();

    const returnLink = screen.getByRole("link", { name: /go to dashboard/i });
    expect(returnLink.getAttribute("href")).toBe("/dashboard");
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
