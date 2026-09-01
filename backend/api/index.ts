export function publicPathFor(request: Request) {
  const url = new URL(request.url);
  const rewrittenPath = url.searchParams.get("__path");
  return rewrittenPath === null ? url.pathname : `/${rewrittenPath}`;
}

/** Vercel Web Handler. The rewrite keeps the original route in __path. */
export default {
  async fetch(request: Request) {
    const pathname = publicPathFor(request);

    // Keep liveness independent of Supabase, SMTP, and the application bundle.
    // A missing secret or dependency must not crash the process health check.
    if (request.method === "GET" && (pathname === "/" || pathname === "/health")) {
      return Response.json({ status: "ok", service: "stockpadi-backend" });
    }

    try {
      const { handleRequest } = await import("../src/app.js");
      return await handleRequest(request, pathname);
    } catch (cause) {
      console.error("backend function bootstrap failed", cause);
      return Response.json(
        { error: { code: "FUNCTION_BOOT_FAILED", message: "Backend function could not start" } },
        { status: 500 },
      );
    }
  },
};
