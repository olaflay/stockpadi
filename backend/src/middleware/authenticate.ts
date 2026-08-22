import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "../shared/supabase/client.js";
import { HttpError } from "../shared/errors/http-error.js";
import { logger } from "../shared/logging/logger.js";

export interface AuthenticatedRequest {
  user: User;
  accessToken: string;
}

export async function authenticateRequest(request: Request): Promise<AuthenticatedRequest> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    logger.warn("authentication failed", { reason: "missing_bearer_token" });
    throw new HttpError(401, "UNAUTHENTICATED", "Missing bearer token");
  }
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data.user) {
    logger.warn("authentication failed", { reason: error?.message ?? "invalid_user" });
    throw new HttpError(401, "UNAUTHENTICATED", "Invalid or expired session");
  }
  logger.info("request authenticated", { userId: data.user.id, email: data.user.email });
  return { user: data.user, accessToken: token };
}
