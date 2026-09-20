import { authenticateRequest } from "../../middleware/authenticate.js";
import { supabaseForAccessToken } from "../../shared/supabase/client.js";
import { getBusinessProfile, updateBusinessProfile } from "./profile.service.js";

export async function handleBusinessProfileGet(request: globalThis.Request) {
  const auth = await authenticateRequest(request);
  return getBusinessProfile(supabaseForAccessToken(auth.accessToken), auth.user);
}

export async function handleBusinessProfileUpdate(request: globalThis.Request, body: unknown) {
  const auth = await authenticateRequest(request);
  return updateBusinessProfile(supabaseForAccessToken(auth.accessToken), auth.user, body);
}
