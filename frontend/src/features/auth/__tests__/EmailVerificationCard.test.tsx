// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EmailVerificationCard } from "../EmailVerificationCard";
import { verifyEmailCode } from "../verification-client";

vi.mock("../verification-client", () => ({
  verifyEmailCode: vi.fn(),
  sendVerificationEmail: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("keeps one focused field through each digit and verifies the full code once", async () => {
  vi.mocked(verifyEmailCode).mockResolvedValue({ ok: false, message: "That code is not correct" });
  render(<EmailVerificationCard userId="owner" />);
  const field = screen.getByRole("textbox", { name: "6-digit verification code" });
  field.focus();
  for (const value of ["0", "04", "042", "0427", "04279"]) {
    fireEvent.change(field, { target: { value } });
    expect(field).toHaveFocus();
    expect(verifyEmailCode).not.toHaveBeenCalled();
  }
  fireEvent.change(field, { target: { value: "042791" } });
  expect(verifyEmailCode).toHaveBeenCalledExactlyOnceWith("042791");
  expect(field).toBeEnabled();
  expect(field).toHaveFocus();
  expect(await screen.findByRole("alert")).toHaveTextContent("That code is not correct");
  expect(field).toHaveFocus();
  expect(field).toHaveAttribute("aria-invalid", "true");
});

it("replaces a partial code with a complete paste and submits without moving focus", async () => {
  vi.mocked(verifyEmailCode).mockResolvedValue({ ok: true });
  const onSuccess = vi.fn();
  render(<EmailVerificationCard userId="owner" onSuccess={onSuccess} />);
  const field = screen.getByRole("textbox");
  field.focus();
  fireEvent.change(field, { target: { value: "99" } });
  fireEvent.paste(field, { clipboardData: { getData: () => " 012 345 " } });
  expect(field).toHaveValue("012345");
  expect(field).toHaveAttribute("autocomplete", "one-time-code");
  expect(field).toHaveAttribute("inputmode", "numeric");
  expect(field).toHaveFocus();
  expect(verifyEmailCode).toHaveBeenCalledExactlyOnceWith("012345");
  await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
});
