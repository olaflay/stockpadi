import { expect, test as base } from "@playwright/test";
import { seedLocalOwner } from "./local-owner";
import { createOriginNetwork } from "./origin-network";

const test = base.extend<{ network: Awaited<ReturnType<typeof createOriginNetwork>> }>({
  network: async ({ baseURL, page }, runFixture) => {
    const network = await createOriginNetwork(baseURL!, page);
    try {
      await runFixture(network);
    } finally {
      await network.close();
    }
  },
});

test("recovers an uncached document offline and checks the live API on reconnect", async ({ page, network }) => {
  await page.goto(`${network.origin}/offline.html`);
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    await navigator.serviceWorker.ready;
  });
  // The worker deliberately does not claim the document that installed it.
  await page.goto(`${network.origin}/offline.html?controlled=1`);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

  const probeStatus = () => page.evaluate(async () => {
    try {
      return (await fetch("/api/environment", { cache: "no-store" })).status;
    } catch {
      return "offline";
    }
  });
  await expect.poll(probeStatus).toBe(200);

  await network.setOffline(true);
  try {
    await expect.poll(probeStatus).toBe("offline");
    const response = await page.goto(`${network.origin}/offline-smoke-uncached-document`, { waitUntil: "commit" });
    expect(response?.ok()).toBe(true);
    await expect(page).toHaveURL(/\/offline-smoke-uncached-document$/);
    await expect(page.getByRole("heading", { name: /you're offline|you’re offline/i })).toBeVisible();
  } finally {
    await network.setOffline(false);
  }

  await expect.poll(probeStatus).toBe(200);
});

test("opens filtered sales, stock, and debtors from warmed documents while offline", async ({ page, network }) => {
  test.setTimeout(60_000);
  await seedLocalOwner(page, network.origin);
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    await navigator.serviceWorker.ready;
  });
  await page.goto(`${network.origin}/dashboard`);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const link = page.getByRole("link", { name: "View sales & receipts" });
  await expect(link).toBeVisible();
  const target = (await link.getAttribute("href"))!;
  await page.evaluate(() => {
    navigator.serviceWorker.controller!.postMessage({
      type: "CACHE_OFFLINE_ROUTES", routes: ["/dashboard", "/sales", "/products", "/contacts"],
    });
  });
  await expect.poll(() => page.evaluate(async () => (
    await Promise.all(["/dashboard", "/sales", "/products", "/contacts"].map((route) => caches.match(route)))
  ).every(Boolean))).toBe(true);
  await network.setOffline(true);
  try {
    await expect(page.getByRole("link", { name: /^Sync status: Offline/ })).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(`${network.origin}${target}`, { timeout: 12_000 });
    const date = new URL(target, page.url()).searchParams.get("date");
    const dayLabel = new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
    });
    await expect(page.getByText(dayLabel, { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/₦250/).first()).toBeVisible();

    await page.goto(`${network.origin}/dashboard`);
    await page.getByRole("link", { name: /View low stock/ }).click();
    await expect(page).toHaveURL(`${network.origin}/products?filter=low-stock`);
    await expect(page.getByText(/Filter: Low stock/)).toBeVisible();

    await page.goto(`${network.origin}/dashboard`);
    await page.getByRole("link", { name: /View debtors/ }).click();
    await expect(page).toHaveURL(`${network.origin}/contacts?filter=debtors`);
    await expect(page.getByRole("button", { name: /^Who owes you/, pressed: true })).toBeVisible();
  } finally {
    await network.setOffline(false);
  }
});
