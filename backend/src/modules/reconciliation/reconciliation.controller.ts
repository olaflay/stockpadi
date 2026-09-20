import { authenticateRequest } from "../../middleware/authenticate.js";
import { supabaseForAccessToken } from "../../shared/supabase/client.js";
import { closeDaySummary, reconciliationHistory, submitReconciliation } from "./reconciliation.service.js";
export async function handleCloseDaySummary(request: globalThis.Request, body: unknown) { const auth = await authenticateRequest(request); return closeDaySummary(supabaseForAccessToken(auth.accessToken), auth.user, body); }
export async function handleCloseDaySummaryGet(request: globalThis.Request) {
  const url = new URL(request.url);
  return handleCloseDaySummary(request, {
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    branchId: url.searchParams.get("branchId") ?? undefined,
  });
}
export async function handleReconciliationSubmit(request: globalThis.Request, body: unknown) { const auth = await authenticateRequest(request); return submitReconciliation(supabaseForAccessToken(auth.accessToken), auth.user, body); }
export async function handleReconciliationHistory(request: globalThis.Request) { const auth = await authenticateRequest(request); return reconciliationHistory(supabaseForAccessToken(auth.accessToken), auth.user); }
