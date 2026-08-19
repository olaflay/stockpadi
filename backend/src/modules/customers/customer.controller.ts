import { authenticateRequest } from "../../middleware/authenticate.js";
import { supabaseAdmin } from "../../shared/supabase/client.js";
import { createCustomer, getCustomerDetail, listCustomers, recordCreditPayment } from "./customer.service.js";

export async function handleCustomerList(request: globalThis.Request) {
  const auth = await authenticateRequest(request);
  return listCustomers(supabaseAdmin(), auth.user);
}

export async function handleCustomerDetail(request: globalThis.Request, customerId: string) {
  const auth = await authenticateRequest(request);
  return getCustomerDetail(supabaseAdmin(), auth.user, customerId);
}

export async function handleCustomerRequest(request: globalThis.Request, body: unknown) {
  const auth = await authenticateRequest(request);
  return createCustomer(supabaseAdmin(), auth.user, body);
}

export async function handleCreditPaymentRequest(request: globalThis.Request, body: unknown) {
  const auth = await authenticateRequest(request);
  return recordCreditPayment(supabaseAdmin(), auth.user, body);
}
