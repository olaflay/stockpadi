import { expect, test } from "@playwright/test";
import { seedLocalOwner } from "./local-owner";

test("keeps dashboard chrome compact and leaves navigation visible during the native date picker", async ({ page }, testInfo) => {
  await seedLocalOwner(page);
  await page.goto("/dashboard");

  const header = page.getByRole("banner", { name: "Application header" });
  const title = header.getByRole("heading", { name: "Dashboard" });
  const bell = header.getByRole("link", { name: /Notifications/ });
  const menu = header.getByRole("button", { name: "Open navigation menu" });
  const status = header.getByRole("link", { name: /^Sync status:/ });
  await expect(status).toBeVisible();
  await expect(status.getByRole("status")).toHaveCSS("font-weight", "400");
  expect((await status.getByRole("status").boundingBox())!.height).toBeLessThanOrEqual(28);

  const centerY = (box: { y: number; height: number }) => box.y + box.height / 2;
  const titleBox = (await title.boundingBox())!;
  const bellBox = (await bell.boundingBox())!;
  expect(Math.abs(centerY(bellBox) - centerY(titleBox))).toBeLessThan(2);
  expect(Math.abs(centerY((await menu.boundingBox())!) - centerY(titleBox))).toBeLessThan(2);
  expect(bellBox.x).toBeGreaterThan((await status.boundingBox())!.x);
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toHaveCount(1);

  const date = page.getByLabel("Sales date");
  await expect(date).toBeAttached();
  const salesCard = page.getByRole("region", { name: "Today's sales" });
  const awning = salesCard.locator('[class*="awning"]');
  const dateBox = (await date.boundingBox())!;
  const roofBox = (await awning.boundingBox())!;
  const gap = roofBox.y - (dateBox.y + dateBox.height);
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThanOrEqual(20);

  await page.screenshot({ path: testInfo.outputPath("dashboard-light.png") });
  const lightBackground = await salesCard.evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(salesCard).not.toHaveCSS("background-color", lightBackground);
  await expect(bell).toHaveCSS("color", await title.evaluate((element) => getComputedStyle(element).color));
  await page.screenshot({ path: testInfo.outputPath("dashboard-dark.png") });

  const nav = page.locator("[data-bottom-nav]");
  const currentDay = await date.inputValue();
  const navBottom = () => nav.evaluate((element) => element.getBoundingClientRect().bottom);
  const initialBottom = await navBottom();

  await date.focus();
  await expect(date).toBeFocused();
  await expect(nav).toHaveCSS("pointer-events", "auto");
  await date.click();
  await expect(nav).toHaveCSS("pointer-events", "auto");
  expect(await navBottom()).toBeCloseTo(initialBottom, 0);
  await page.keyboard.press("Escape");
  await expect(date.locator("..")).toHaveCSS("box-shadow", "none");
  await title.click();
  await expect(date).toHaveValue(currentDay);
  await expect(nav).toHaveCSS("pointer-events", "auto");
  expect(await navBottom()).toBeCloseTo(initialBottom, 0);

  // Simulate the viewport reduction that accompanies a real text keyboard.
  await page.evaluate(() => {
    const input = document.createElement("input");
    input.setAttribute("aria-label", "Keyboard fixture");
    document.querySelector("main")!.prepend(input);
    input.focus();
    const viewport = window.visualViewport!;
    Object.defineProperty(viewport, "height", { configurable: true, value: window.innerHeight - 250 });
    viewport.dispatchEvent(new Event("resize"));
  });
  await expect(nav).toHaveAttribute("inert", "");
  await page.evaluate(() => {
    const viewport = window.visualViewport!;
    Reflect.deleteProperty(viewport, "height");
    viewport.dispatchEvent(new Event("resize"));
    document.querySelector('[aria-label="Keyboard fixture"]')?.remove();
  });
  await expect(nav).not.toHaveAttribute("inert", "");
  await expect(nav).toHaveCSS("pointer-events", "auto");
});
