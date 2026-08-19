import type { SupabaseClient, User } from "@supabase/supabase-js";
import { HttpError } from "../../shared/errors/http-error.js";
import { resolveAccountContext } from "../accounts/account-context.js";

function dateRange(input: unknown) {
  const body = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const from = typeof body.from === "string" ? body.from : new Date(0).toISOString();
  const to = typeof body.to === "string" ? body.to : new Date().toISOString();
  if (Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to)) || Date.parse(from) > Date.parse(to)) throw new HttpError(400, "INVALID_BODY", "Invalid report date range");
  return { from, to, branchId: typeof body.branchId === "string" ? body.branchId : null };
}

export async function reportSummary(db: SupabaseClient, actor: User, input: unknown) {
  const context = await resolveAccountContext(db, actor);
  if (!context.businessId) throw new HttpError(403, "FORBIDDEN", "A business account is required");
  const range = dateRange(input);
  if (context.accountType === "WORKER" && range.branchId && !context.branchIds.includes(range.branchId)) throw new HttpError(403, "FORBIDDEN", "Branch is outside this account's assigned branches");
  const [sales, expenses, purchases] = await Promise.all([
    db.from("sales").select("id, branch_id, customer_id, subtotal, discount, total, created_at, created_by_user_id, voided_at").eq("business_id", context.businessId).gte("created_at", range.from).lte("created_at", range.to).is("voided_at", null),
    db.from("expenses").select("id, branch_id, category, amount, note, created_at, created_by_user_id").eq("business_id", context.businessId).gte("created_at", range.from).lte("created_at", range.to),
    db.from("purchases").select("id, branch_id, supplier_id, status, created_at, created_by_user_id").eq("business_id", context.businessId).gte("created_at", range.from).lte("created_at", range.to),
  ]);
  const failure = [sales, expenses, purchases].find((result) => result.error);
  if (failure?.error) throw new HttpError(500, "REPORT_FAILED", failure.error.message);
  const assigned = context.accountType === "WORKER" ? new Set(context.branchIds) : null;
  const filterBranch = (row: { branch_id: string }) => (!range.branchId || row.branch_id === range.branchId) && (!assigned || assigned.has(row.branch_id));
  const salesRows = (sales.data ?? []).filter(filterBranch);
  const expenseRows = (expenses.data ?? []).filter(filterBranch);
  const purchaseRows = (purchases.data ?? []).filter(filterBranch);
  const { data: products, error: productsError } = await db.from("products").select("id, name, sku, cost_price, sell_price, low_stock_threshold").eq("business_id", context.businessId);
  if (productsError) throw new HttpError(500, "REPORT_FAILED", productsError.message);
  const productIds = (products ?? []).map((product) => product.id as string);
  const stockResult = productIds.length ? await db.from("inventory_stock").select("product_id, branch_id, quantity").in("product_id", productIds) : { data: [], error: null };
  if (stockResult.error) throw new HttpError(500, "REPORT_FAILED", stockResult.error.message);
  const saleIds = salesRows.map((sale) => sale.id as string);
  const [paymentResult, itemResult] = saleIds.length ? await Promise.all([
    db.from("sale_payments").select("sale_id, method, amount").in("sale_id", saleIds),
    db.from("sale_items").select("sale_id, product_id, quantity, unit_price, discount, unit_label, unit_conversion_factor").in("sale_id", saleIds),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  if (paymentResult.error || itemResult.error) throw new HttpError(500, "REPORT_FAILED", paymentResult.error?.message ?? itemResult.error?.message ?? "Could not load report details");
  const detailedSales = salesRows.map((sale) => ({ ...sale, payments: (paymentResult.data ?? []).filter((payment) => payment.sale_id === sale.id), items: (itemResult.data ?? []).filter((item) => item.sale_id === sale.id) }));
  return { from: range.from, to: range.to, branchId: range.branchId, salesTotal: salesRows.reduce((sum, row) => sum + Number(row.total), 0), expensesTotal: expenseRows.reduce((sum, row) => sum + Number(row.amount), 0), salesCount: salesRows.length, purchaseCount: purchaseRows.length, sales: detailedSales, expenses: expenseRows, purchases: purchaseRows, products: products ?? [], stock: stockResult.data ?? [] };
}
