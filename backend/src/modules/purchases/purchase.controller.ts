import { authenticateRequest } from "../../middleware/authenticate.js";
import { supabaseAdmin, supabaseForAccessToken } from "../../shared/supabase/client.js";
import { listPurchases, receivePurchase } from "./purchase.service.js";
export async function handlePurchaseList(request: globalThis.Request) { const auth = await authenticateRequest(request); return listPurchases(supabaseForAccessToken(auth.accessToken), auth.user); }
export async function handlePurchase(request: globalThis.Request, body: unknown) { const auth = await authenticateRequest(request); return receivePurchase(supabaseAdmin(), auth.user, body); }
