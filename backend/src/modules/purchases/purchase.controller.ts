import { authenticateRequest } from "../../middleware/authenticate.js";
import { supabaseAdmin } from "../../shared/supabase/client.js";
import { listPurchases, receivePurchase } from "./purchase.service.js";
export async function handlePurchaseList(request: globalThis.Request) { const auth = await authenticateRequest(request); return listPurchases(supabaseAdmin(), auth.user); }
export async function handlePurchase(request: globalThis.Request, body: unknown) { const auth = await authenticateRequest(request); return receivePurchase(supabaseAdmin(), auth.user, body); }
