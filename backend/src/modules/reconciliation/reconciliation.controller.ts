import { authenticateRequest } from "../../middleware/authenticate.js";
import { supabaseAdmin } from "../../shared/supabase/client.js";
import { closeDaySummary, reconciliationHistory, submitReconciliation } from "./reconciliation.service.js";
export async function handleCloseDaySummary(request: globalThis.Request, body: unknown) { const auth = await authenticateRequest(request); return closeDaySummary(supabaseAdmin(), auth.user, body); }
export async function handleCloseDaySummaryGet(request: globalThis.Request) { return handleCloseDaySummary(request, {}); }
export async function handleReconciliationSubmit(request: globalThis.Request, body: unknown) { const auth = await authenticateRequest(request); return submitReconciliation(supabaseAdmin(), auth.user, body); }
export async function handleReconciliationHistory(request: globalThis.Request) { const auth = await authenticateRequest(request); return reconciliationHistory(supabaseAdmin(), auth.user); }
