import { cookies } from "next/headers";
import crypto from "crypto";

const CSRF_COOKIE_NAME = "x-csrf-token";

/**
 * Reads the CSRF token cookie for the current request. The cookie itself is
 * issued by src/middleware.ts — Next.js only allows setting cookies from a
 * Server Action, a Route Handler, or middleware, never from a plain Server
 * Component render (which is what this function used to do, and which
 * throws "Cookies can only be modified in a Server Action or Route Handler"
 * at runtime). Every page that calls this must be listed in the middleware
 * matcher so the cookie is guaranteed to exist by the time this runs.
 */
export async function generateCsrfToken(): Promise<string> {
  const cookieStore = await cookies();
  return cookieStore.get(CSRF_COOKIE_NAME)?.value ?? "";
}

export async function verifyCsrfToken(submittedToken: string): Promise<boolean> {
  if (!submittedToken) return false;
  
  const cookieStore = await cookies();
  const storedToken = cookieStore.get(CSRF_COOKIE_NAME)?.value;
  
  if (!storedToken) return false;
  
  try {
    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(storedToken, "utf8"),
      Buffer.from(submittedToken, "utf8")
    );
  } catch (e) {
    // Fails if lengths don't match
    return false;
  }
}
