import { handleRequest } from "../src/app.js";

export function publicPathFor(request: Request) {
  const url = new URL(request.url);
  const rewrittenPath = url.searchParams.get("__path");
  return rewrittenPath === null ? url.pathname : `/${rewrittenPath}`;
}

/** Vercel Web Handler. The rewrite keeps the original route in __path. */
export default {
  fetch(request: Request) {
    return handleRequest(request, publicPathFor(request));
  },
};
