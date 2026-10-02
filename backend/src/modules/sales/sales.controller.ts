import { authenticateRequest } from "../../middleware/authenticate.js";
import { supabaseAdmin, supabaseForAccessToken } from "../../shared/supabase/client.js";
import { parseVoidSaleRequest } from "./void-sale.schema.js";
import { voidSale } from "./void-sale.service.js";
import { listSales } from "./sales.service.js";

import { parseRefundSaleRequest } from "./refund-sale.schema.js";
import { refundSale } from "./refund-sale.service.js";

export async function handleSalesList(request: globalThis.Request) {
  const auth = await authenticateRequest(request);
  return listSales(supabaseForAccessToken(auth.accessToken), auth.user);
}

export async function handleVoidSale(request: globalThis.Request, body: unknown) {
  const auth = await authenticateRequest(request);
  return voidSale(supabaseAdmin(), auth.user, parseVoidSaleRequest(body));
}

export async function handleRefundSale(request: globalThis.Request, body: unknown) {
  const auth = await authenticateRequest(request);
  return refundSale(supabaseAdmin(), auth.user, parseRefundSaleRequest(body));
}

