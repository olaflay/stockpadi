import { expect, test } from "@playwright/test";
import { seedLocalOwner } from "./local-owner";

test("Products filters are tonal, keyboard reachable, and offer a way back from an empty result", async ({ page }) => {
  await seedLocalOwner(page);
  await page.goto("/products");

  const filters = page.getByRole("group", { name: "Filter products" });
  await expect(filters).toBeVisible({ timeout: 15_000 });
  const archived = filters.getByRole("button", { name: /archived/i });
  await expect(archived).toHaveCSS("border-top-width", "0px");
  await page.keyboard.press("Tab");
  await archived.focus();
  await expect(archived).toBeFocused();
  await expect(archived).toHaveCSS("box-shadow", /0px 0px 0px 2px/);
  await page.keyboard.press("Enter");
  await expect(archived).toHaveAttribute("aria-pressed", "true");

  const empty = page.getByText("No archived products", { exact: true }).locator("xpath=../..");
  await expect(empty.locator("svg.state-scene")).toBeVisible();
  await expect(empty.locator("svg.state-scene")).toHaveAttribute("aria-hidden", "true");
  await page.getByRole("button", { name: "Show all products" }).click();
  await expect(filters.getByRole("button", { name: /^all$/i })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Test item", { exact: true })).toBeVisible();
});

test("an empty historical sales filter restores the receipt list", async ({ page }) => {
  await seedLocalOwner(page);
  await page.goto("/sales?date=2000-01-01");
  await expect(page.getByText("No sales match these filters")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Show all dates and payments" }).click();
  await expect(page.locator('a[href="/sales/fixture-sale"]')).toBeVisible({ timeout: 15_000 });
});
