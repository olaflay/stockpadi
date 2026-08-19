import { authenticateRequest } from "../../middleware/authenticate.js";
import { supabaseAdmin } from "../../shared/supabase/client.js";
import { adjustStock, listInventory, listProducts, upsertProduct } from "./inventory.service.js";
export async function handleProduct(request: globalThis.Request, body: unknown) { const auth = await authenticateRequest(request); return upsertProduct(supabaseAdmin(), auth.user, body); }
export async function handleStockAdjustment(request: globalThis.Request, body: unknown) { const auth = await authenticateRequest(request); return adjustStock(supabaseAdmin(), auth.user, body); }
export async function handleProductList(request: globalThis.Request) { const auth = await authenticateRequest(request); return listProducts(supabaseAdmin(), auth.user); }
export async function handleInventoryList(request: globalThis.Request) { const auth = await authenticateRequest(request); return listInventory(supabaseAdmin(), auth.user); }
