import { expect, test } from "@playwright/test";

test("recovers an uncached document offline and checks the live API on reconnect", async ({ page, context }) => {
  await page.goto("/offline.html");
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    await navigator.serviceWorker.ready;
  });
  // The worker deliberately does not claim the document that installed it.
  await page.goto("/offline.html?controlled=1");
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

  const probeStatus = () => page.evaluate(async () => {
    try {
      return (await fetch("/api/environment", { cache: "no-store" })).status;
    } catch {
      return "offline";
    }
  });
  await expect.poll(probeStatus).toBe(200);

  await context.setOffline(true);
  try {
    await expect.poll(probeStatus).toBe("offline");
    const [response] = await Promise.all([
      page.waitForResponse((result) =>
        result.url().endsWith("/offline-smoke-uncached-document") && result.fromServiceWorker()
      ),
      page.goto("/offline-smoke-uncached-document", { waitUntil: "commit" }),
    ]);
    await expect(page).toHaveURL(/\/offline-smoke-uncached-document$/);
    expect(await response.text()).toContain('id="offline-title"');
    await expect(page.getByRole("heading", { name: /you're offline|you’re offline/i })).toBeVisible();
    expect(response.ok()).toBe(true);
  } finally {
    await context.setOffline(false);
  }

  await expect.poll(probeStatus).toBe(200);
});
