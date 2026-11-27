// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { SelectInput } from "../SelectInput";
import { TextInput } from "../TextInput";

afterEach(cleanup);

it("exposes a text field error alongside its help and clears it on correction", () => {
  const { rerender } = render(
    <TextInput hasError aria-invalid={false} aria-describedby="help" errorId="error" />,
  );
  const field = screen.getByRole("textbox");
  expect(field).toHaveAttribute("aria-invalid", "true");
  expect(field).toHaveAttribute("aria-describedby", "help error");

  rerender(<TextInput aria-describedby="help" errorId="error" />);
  expect(field).not.toHaveAttribute("aria-invalid");
  expect(field).toHaveAttribute("aria-describedby", "help");
});

it("keeps warnings advisory and exposes a select error as invalid", () => {
  const { rerender } = render(<SelectInput validationState="warning" aria-describedby="warning" />);
  const field = screen.getByRole("combobox");
  expect(field).toHaveAttribute("data-validation-state", "warning");
  expect(field).not.toHaveAttribute("aria-invalid");
  expect(field).toHaveAttribute("aria-describedby", "warning");

  rerender(<SelectInput validationState="error" />);
  expect(field).not.toHaveAttribute("data-validation-state");
  expect(field).toHaveAttribute("aria-invalid", "true");
});
