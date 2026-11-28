import { expect, test } from "@playwright/test";
import { seedLocalOwner } from "./local-owner";

test("fills shared phone-book fields and preserves the form when the picker is cancelled", async ({ page }) => {
  await page.addInitScript(() => {
    let selections = 0;
    Object.defineProperty(navigator, "contacts", {
      value: {
        async select(properties: string[]) {
          if (!navigator.userActivation.isActive || properties.join(",") !== "name,tel") {
            throw new DOMException("", "NotAllowedError");
          }
          return selections++ === 0 ? [{ name: ["Fixture Contact"], tel: ["", "+234 (803) 123-4567"] }] : [];
        },
      },
    });
  });
  await seedLocalOwner(page);
  await page.goto("/contacts");
  await page.getByRole("button", { name: "Add contact", exact: true }).first().click();
  const picker = page.getByRole("button", { name: "Pick from phone contacts" });
  await picker.click();
  const name = page.getByLabel("Full name");
  const phone = page.getByLabel("Phone number");
  await expect(name).toHaveValue("Fixture Contact");
  await expect(phone).toHaveValue("+2348031234567");

  await picker.click();
  await expect(name).toHaveValue("Fixture Contact");
  await expect(phone).toHaveValue("+2348031234567");
});
