// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { persistFormDraftsForReload, restoreFormDraftsAfterReload } from "./pwa-reload-drafts";

describe("PWA reload draft recovery", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    sessionStorage.removeItem("stockpadi-cart");
    sessionStorage.removeItem("stockpadi-pwa-reload-drafts-v1");
    sessionStorage.removeItem("stockpadi-pwa-reload-drafts-restored-v1");
    history.replaceState(null, "", "/business/products/new");
  });

  it("restores form values after reload without touching the existing cart draft", () => {
    document.body.innerHTML = `
      <form id="product-form">
        <input name="name" value="Tea">
        <input name="quantity" type="number" value="12">
        <input name="password" type="password" value="must-not-save">
      </form>`;
    sessionStorage.setItem("stockpadi-cart", JSON.stringify({ line: { quantity: 2 } }));
    persistFormDraftsForReload();
    const stored = sessionStorage.getItem("stockpadi-pwa-reload-drafts-v1");
    expect(stored).not.toContain("must-not-save");
    (document.querySelector('[name="name"]') as HTMLInputElement).value = "";
    (document.querySelector('[name="quantity"]') as HTMLInputElement).value = "0";

    restoreFormDraftsAfterReload();

    expect((document.querySelector('[name="name"]') as HTMLInputElement).value).toBe("Tea");
    expect((document.querySelector('[name="quantity"]') as HTMLInputElement).value).toBe("12");
    expect(sessionStorage.getItem("stockpadi-cart")).toContain('"quantity":2');
    expect(sessionStorage.getItem("stockpadi-pwa-reload-drafts-v1")).toBe(stored);
  });
});
