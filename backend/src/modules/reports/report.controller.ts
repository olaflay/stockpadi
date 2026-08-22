import { authenticateRequest } from "../../middleware/authenticate.js";
import { supabaseAdmin } from "../../shared/supabase/client.js";
import { reportSummary } from "./report.service.js";
export async function handleReportSummary(request: globalThis.Request, body: unknown) { const auth = await authenticateRequest(request); return reportSummary(supabaseAdmin(), auth.user, body); }
export async function handleReportSummaryGet(request: globalThis.Request) {
  const url = new URL(request.url);
  return handleReportSummary(request, { from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined, branchId: url.searchParams.get("branchId") ?? undefined });
}
