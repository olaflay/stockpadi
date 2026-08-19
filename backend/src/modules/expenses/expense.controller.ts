import { authenticateRequest } from "../../middleware/authenticate.js";
import { supabaseAdmin } from "../../shared/supabase/client.js";
import { createExpense, listExpenses } from "./expense.service.js";
export async function handleExpenseList(request: globalThis.Request) { const auth = await authenticateRequest(request); return listExpenses(supabaseAdmin(), auth.user); }
export async function handleExpense(request: globalThis.Request, body: unknown) { const auth = await authenticateRequest(request); return createExpense(supabaseAdmin(), auth.user, body); }
