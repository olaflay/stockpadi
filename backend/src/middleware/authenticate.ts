import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "../shared/supabase/client.js";
import { HttpError } from "../shared/errors/http-error.js";

export interface AuthenticatedRequest {
  user: User;
  accessToken: string;
}

export async function authenticateRequest(request: Request): Promise<AuthenticatedRequest> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "UNAUTHENTICATED", "Missing bearer token");
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "UNAUTHENTICATED", "Invalid or expired session");
  return { user: data.user, accessToken: token };
}
