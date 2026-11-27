// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CategoryAutocomplete } from "../CategoryAutocomplete";

afterEach(cleanup);

it.each([
  { label: "Drinks", id: "drinks", query: "" },
  { label: "Snacks", id: "snacks", query: "" },
  { label: /as a new category/, id: "", query: "Frozen" },
])("requires a click for the $label option after a touch drag", ({ label, id, query }) => {
  const onSelect = vi.fn();
  render(
    <CategoryAutocomplete
      categories={[{ id: "drinks", name: "Drinks" }, { id: "snacks", name: "Snacks" }]}
      recentIds={["drinks"]}
      value=""
      valueName=""
      onSelect={onSelect}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Browse all categories" }));
  if (query) fireEvent.change(screen.getByRole("combobox"), { target: { value: query } });
  const option = screen.getByRole("option", { name: label });

  fireEvent.touchStart(option, { touches: [{ clientY: 150 }] });
  fireEvent.touchMove(option, { touches: [{ clientY: 80 }] });
  fireEvent.touchEnd(option);
  fireEvent.mouseDown(option);
  expect(onSelect).not.toHaveBeenCalled();
  expect(screen.getByRole("listbox")).toBeInTheDocument();

  fireEvent.click(option);
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(id, query || label);
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});
