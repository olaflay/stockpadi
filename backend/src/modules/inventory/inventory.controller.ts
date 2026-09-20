import { authenticateRequest } from "../../middleware/authenticate.js";
import { supabaseAdmin, supabaseForAccessToken } from "../../shared/supabase/client.js";
import { adjustStock, listCategories, listInventory, listProducts, submitStockCount, upsertProduct } from "./inventory.service.js";
export async function handleProduct(request: globalThis.Request, body: unknown) { const auth = await authenticateRequest(request); return upsertProduct(supabaseAdmin(), auth.user, body); }
export async function handleStockAdjustment(request: globalThis.Request, body: unknown) { const auth = await authenticateRequest(request); return adjustStock(supabaseAdmin(), auth.user, body); }
export async function handleStockCount(request: globalThis.Request, body: unknown) { const auth = await authenticateRequest(request); return submitStockCount(supabaseAdmin(), auth.user, body); }
export async function handleProductList(request: globalThis.Request) { const auth = await authenticateRequest(request); return listProducts(supabaseForAccessToken(auth.accessToken), auth.user); }
export async function handleCategoryList(request: globalThis.Request) { const auth = await authenticateRequest(request); return listCategories(supabaseForAccessToken(auth.accessToken), auth.user); }
export async function handleInventoryList(request: globalThis.Request) { const auth = await authenticateRequest(request); return listInventory(supabaseForAccessToken(auth.accessToken), auth.user); }
