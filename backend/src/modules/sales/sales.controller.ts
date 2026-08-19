import { authenticateRequest } from "../../middleware/authenticate.js";
import { supabaseAdmin } from "../../shared/supabase/client.js";
import { parseVoidSaleRequest } from "./void-sale.schema.js";
import { voidSale } from "./void-sale.service.js";
import { listSales } from "./sales.service.js";

export async function handleSalesList(request: globalThis.Request) {
  const auth = await authenticateRequest(request);
  return listSales(supabaseAdmin(), auth.user);
}

export async function handleVoidSale(request: globalThis.Request, body: unknown) {
  const auth = await authenticateRequest(request);
  return voidSale(supabaseAdmin(), auth.user, parseVoidSaleRequest(body));
}
