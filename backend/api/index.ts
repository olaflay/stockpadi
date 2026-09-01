import type { IncomingMessage, ServerResponse } from "node:http";

export function restorePublicUrl(request: Pick<IncomingMessage, "headers" | "url">) {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const rewrittenPath = url.searchParams.get("__path");
  if (rewrittenPath === null) return url.pathname;

  url.searchParams.delete("__path");
  const search = url.searchParams.toString();
  const pathname = `/${rewrittenPath}`;
  request.url = `${pathname}${search ? `?${search}` : ""}`;
  return pathname;
}

/** Vercel Node handler. Health stays independent of the application bundle. */
export default async function handler(request: IncomingMessage, response: ServerResponse) {
  const pathname = restorePublicUrl(request);

  if (request.method === "GET" && (pathname === "/" || pathname === "/health")) {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok", service: "stockpadi-backend" }));
    return;
  }

  try {
    const { createApp } = await import("../src/app.js");
    await createApp()(request, response);
  } catch (cause) {
    console.error("backend function bootstrap failed", cause);
    if (response.headersSent) return response.end();
    response.writeHead(500, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: { code: "FUNCTION_BOOT_FAILED", message: "Backend function could not start" } }));
  }
}
