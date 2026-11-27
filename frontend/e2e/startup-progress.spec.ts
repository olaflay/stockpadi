import { expect, test } from "@playwright/test";

test("animates startup progress before hydration and honors reduced motion", async ({ page }) => {
  await page.route("**/_next/static/**/*.js", (route) => route.abort());
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText(/opening/i);

  const segment = page.locator(".startup-progress-segment");
  await expect(segment).toHaveCSS("animation-name", "startup-progress");
  await segment.evaluate(async (element) => {
    const [animation] = element.getAnimations();
    await animation.ready;
    animation.pause();
    animation.currentTime = 200;
  });
  const initialPosition = await segment.evaluate((element) => getComputedStyle(element).transform);
  await segment.evaluate((element) => { element.getAnimations()[0].currentTime = 700; });
  await expect(segment).not.toHaveCSS("transform", initialPosition);

  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await expect(segment).toBeVisible();
  await expect(segment).toHaveCSS("animation-name", "none");
});
