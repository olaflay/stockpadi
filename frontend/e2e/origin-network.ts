import { createServer, request } from "node:http";
import type { AddressInfo } from "node:net";
import type { Page } from "@playwright/test";

export async function createOriginNetwork(baseURL: string, page: Page) {
  // WebKit's Playwright offline toggle rejects even worker-served responses.
  // Drop real connections to a disposable proxy so the worker can still run.
  let disconnected = false;
  const upstream = new URL(baseURL);
  const server = createServer((incoming, outgoing) => {
    if (disconnected) {
      incoming.socket.destroy();
      return;
    }
    const forward = request({
      hostname: upstream.hostname,
      port: upstream.port,
      method: incoming.method,
      path: incoming.url,
      headers: incoming.headers,
    }, (response) => {
      outgoing.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(outgoing);
    });
    forward.on("error", () => outgoing.destroy());
    incoming.pipe(forward);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => localStorage.getItem("fixture-disconnected") !== "1",
    });
  });

  return {
    origin,
    setOffline: async (offline: boolean) => {
      disconnected = offline;
      await page.evaluate((enabled) => {
        if (enabled) localStorage.setItem("fixture-disconnected", "1");
        else localStorage.removeItem("fixture-disconnected");
        window.dispatchEvent(new Event(enabled ? "offline" : "online"));
      }, offline);
    },
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
  };
}
