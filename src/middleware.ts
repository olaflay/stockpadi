import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const CSRF_COOKIE_NAME = "x-csrf-token";

/**
 * Issues the CSRF cookie for auth pages. Next.js only allows setting cookies
 * from a Server Action, a Route Handler, or middleware — never from a plain
 * Server Component render, which is where this used to live (src/lib/csrf.ts
 * previously called cookieStore.set() straight from LoginPage/etc, which
 * throws "Cookies can only be modified in a Server Action or Route Handler").
 * Uses Web Crypto (crypto.getRandomValues) rather than Node's crypto module
 * since middleware runs in the Edge runtime by default.
 */
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  if (!request.cookies.get(CSRF_COOKIE_NAME)) {
    response.cookies.set(CSRF_COOKIE_NAME, generateToken(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 3600,
    });
  }
  return response;
}

export const config = {
  matcher: ["/login", "/register", "/forgot-password", "/reset-password"],
};
