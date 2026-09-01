import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "../src/app.js";

const app = createApp();

export function restorePublicUrl(request: Pick<IncomingMessage, "headers" | "url">) {
  const rewrittenUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const publicPath = rewrittenUrl.searchParams.get("__path");

  if (publicPath === null) return;

  rewrittenUrl.searchParams.delete("__path");
  const search = rewrittenUrl.searchParams.toString();
  request.url = `/${publicPath}${search ? `?${search}` : ""}`;
}

/**
 * Vercel invokes an exported function for every request. The rewrite stores the
 * public path in __path so the existing router sees /health and /api/* instead
 * of the internal /api function destination.
 */
export default function handler(request: IncomingMessage, response: ServerResponse) {
  restorePublicUrl(request);
  return app(request, response);
}
