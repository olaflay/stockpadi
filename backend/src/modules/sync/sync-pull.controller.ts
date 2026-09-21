import { authenticateRequest } from "../../middleware/authenticate.js";
import { supabaseAdmin, supabaseForAccessToken } from "../../shared/supabase/client.js";
import { pullSession } from "./sync-pull.service.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { logger } from "../../shared/logging/logger.js";

export async function handleSyncPull(request: globalThis.Request) {
  const auth = await authenticateRequest(request);
  try {
    const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;
    return await pullSession(supabaseForAccessToken(auth.accessToken), auth.user, cursor, supabaseAdmin());
  } catch (cause) {
    if (cause instanceof HttpError) throw cause;
    // The full exception remains server-side. The API returns only a stable,
    // non-sensitive code that the diagnostics screen can explain.
    logger.error("sync pull request failed", { userId: auth.user.id, code: "PULL_FAILED" }, cause);
    throw new HttpError(500, "PULL_FAILED", "Could not download the latest data from the cloud.");
  }
}
