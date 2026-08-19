import type { SupabaseClient, User } from "@supabase/supabase-js";
import { HttpError } from "../../shared/errors/http-error.js";
import { resolveAccountContext } from "../accounts/account-context.js";
import { parseCreditPayment, parseCustomer } from "./customer.schema.js";

export async function createCustomer(db: SupabaseClient, actor: User, input: unknown) {
  const context = await resolveAccountContext(db, actor);
  if (!context.businessId) throw new HttpError(403, "FORBIDDEN", "A business account is required");
  const customer = parseCustomer(input);
  const { data, error } = await db.rpc("sync_apply_customer", { payload: customer, actor_id: actor.id });
  if (error) throw new HttpError(500, "CUSTOMER_CREATE_FAILED", error.message);
  return data;
}

export async function listCustomers(db: SupabaseClient, actor: User) {
  const context = await resolveAccountContext(db, actor);
  if (!context.businessId) throw new HttpError(403, "FORBIDDEN", "A business account is required");
  const { data: customers, error } = await db.from("customers").select("id, name, phone, updated_at").eq("business_id", context.businessId).order("name");
  if (error) throw new HttpError(500, "CUSTOMERS_LOAD_FAILED", error.message);
  const ids = (customers ?? []).map((customer) => customer.id as string);
  if (!ids.length) return { customers: [] };
  const { data: balances, error: balanceError } = await db.from("customer_credit_balances").select("customer_id, balance").in("customer_id", ids);
  if (balanceError) throw new HttpError(500, "CREDIT_BALANCES_LOAD_FAILED", balanceError.message);
  const balanceByCustomer = new Map((balances ?? []).map((balance) => [balance.customer_id as string, Number(balance.balance ?? 0)]));
  return { customers: (customers ?? []).map((customer) => ({ ...customer, balance: balanceByCustomer.get(customer.id as string) ?? 0 })) };
}

export async function recordCreditPayment(db: SupabaseClient, actor: User, input: unknown) {
  const context = await resolveAccountContext(db, actor);
  if (!context.businessId) throw new HttpError(403, "FORBIDDEN", "A business account is required");
  const payment = parseCreditPayment(input);
  const { data, error } = await db.rpc("sync_apply_credit_payment", { payload: payment, actor_id: actor.id });
  if (error) throw new HttpError(500, "CREDIT_PAYMENT_FAILED", error.message);
  return data;
}

export async function getCustomerDetail(db: SupabaseClient, actor: User, customerId: string) {
  const context = await resolveAccountContext(db, actor);
  if (!context.businessId) throw new HttpError(403, "FORBIDDEN", "A business account is required");
  const { data: customer, error } = await db.from("customers").select("id, name, phone, updated_at").eq("id", customerId).eq("business_id", context.businessId).maybeSingle();
  if (error) throw new HttpError(500, "CUSTOMER_LOAD_FAILED", error.message);
  if (!customer) throw new HttpError(404, "NOT_FOUND", "Customer not found");
  const [movements, sales] = await Promise.all([
    db.from("customer_credit_movements").select("id, client_id, amount_delta, source_reference_id, note, created_at_local, created_by_user_id").eq("customer_id", customerId).eq("business_id", context.businessId).order("created_at_local", { ascending: false }),
    db.from("sales").select("id, branch_id, total, created_at, created_by_user_id, voided_at").eq("customer_id", customerId).eq("business_id", context.businessId).order("created_at", { ascending: false }).limit(100),
  ]);
  if (movements.error || sales.error) throw new HttpError(500, "CUSTOMER_HISTORY_FAILED", movements.error?.message ?? sales.error?.message ?? "Could not load customer history");
  return { customer, creditMovements: movements.data ?? [], sales: sales.data ?? [] };
}
