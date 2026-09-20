import { authenticateRequest } from "../../middleware/authenticate.js";
import { resolveAccountContext } from "../accounts/account-context.js";
import { supabaseAdmin, supabaseForAccessToken } from "../../shared/supabase/client.js";
import { parseWorkerRequest } from "./worker.schema.js";
import { executeWorkerOperation, getStaffAudit, getStaffMember, listStaff } from "./worker.service.js";

export async function handleWorkerList(request: globalThis.Request) {
  const auth = await authenticateRequest(request);
  const context = await resolveAccountContext(supabaseAdmin(), auth.user, { allowPendingOwner: true });
  return listStaff(context, supabaseForAccessToken(auth.accessToken));
}

export async function handleWorkerMember(request: globalThis.Request, userId: string) {
  const auth = await authenticateRequest(request);
  const context = await resolveAccountContext(supabaseAdmin(), auth.user, { allowPendingOwner: true });
  return getStaffMember(context, userId, supabaseForAccessToken(auth.accessToken));
}

export async function handleWorkerAudit(request: globalThis.Request) {
  const auth = await authenticateRequest(request);
  const context = await resolveAccountContext(supabaseAdmin(), auth.user, { allowPendingOwner: true });
  return getStaffAudit(context, supabaseForAccessToken(auth.accessToken));
}

export async function handleWorkerRequest(request: globalThis.Request, body: unknown) {
  const auth = await authenticateRequest(request);
  const context = await resolveAccountContext(supabaseAdmin(), auth.user, { allowPendingOwner: true });
  return executeWorkerOperation(context, parseWorkerRequest(body));
}
