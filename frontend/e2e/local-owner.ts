import type { Page } from "@playwright/test";

export async function seedLocalOwner(page: Page) {
  await page.route("**/api/version", (route) =>
    route.fulfill({ json: { build: "fixture", minClient: "0.1.0" } })
  );
  // Start with the app-created database and a disposable local-only owner.
  await page.goto("/dashboard");
  await page.waitForURL("**/login?force=true");
  await page.evaluate(async () => {
    const owner = "dashboard-browser-test";
    const businessId = "dashboard-browser-business";
    localStorage.setItem(`stockpadi.guided-tour.v2:${owner}`, "complete");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("stockpadi");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(["session", "localUsers", "syncPullState", "products", "sales"], "readwrite");
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
        const time = new Date().toISOString();
        transaction.objectStore("localUsers").put({
          id: owner, businessId, fullName: "Fixture Owner", accountType: "BUSINESS_OWNER",
          isActive: true, emailVerified: true, businessStatus: "verified", updatedAt: time,
        });
        transaction.objectStore("session").put({
          id: "current", userId: owner, deviceId: "fixture", expiresAt: new Date(Date.now() + 60_000).toISOString(),
        });
        transaction.objectStore("syncPullState").put({
          id: `${businessId}:session`, businessId, completedAt: time, lastCompletePullAt: time,
          nextPullAttemptAt: new Date(Date.now() + 300_000).toISOString(),
        });
        transaction.objectStore("products").put({
          id: "fixture-product", businessId, sku: "FIXTURE-1", barcode: "000012345678901234", name: "Test item",
          unitLabel: "piece", costPrice: 100, sellPrice: 150, expiryTracking: "off",
          expiryDate: null, lowStockThreshold: null, version: 1, updatedAt: time,
        });
        transaction.objectStore("sales").put({
          id: "fixture-sale", clientId: "fixture-sale", businessId, branchId: "fixture-branch",
          customerId: null, createdByUserId: owner, createdAt: time, createdAtLocal: time, voidedAt: null,
          subtotal: 300, discount: 50, total: 250, payments: [{ method: "cash", amount: 250 }],
          items: [{
            productId: "fixture-product", productNameSnapshot: "Sale-time item name", unitLabel: "piece",
            quantity: 2, unitPrice: 150, discount: 50, conversionFactor: 1, movementClientId: "fixture-movement",
          }],
        });
      });
    } finally {
      db.close();
    }
  });
}
