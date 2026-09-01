import { handleAccountContext } from "./modules/accounts/account.controller.js";
import { handleAdminRequest } from "./modules/admin/admin.controller.js";
import { handleSalesList, handleVoidSale } from "./modules/sales/sales.controller.js";
import { handleWorkerAudit, handleWorkerList, handleWorkerMember, handleWorkerRequest } from "./modules/workers/worker.controller.js";
import { handleBusinessRegistration } from "./modules/businesses/business.controller.js";
import { handleBranchCreate, handleBranchList } from "./modules/businesses/branch.controller.js";
import { businessRoutes } from "./modules/businesses/business.routes.js";
import { branchRoutes } from "./modules/businesses/branch.routes.js";
import { handleCreditPaymentRequest, handleCustomerDetail, handleCustomerList, handleCustomerRequest } from "./modules/customers/customer.controller.js";
import { customerRoutes } from "./modules/customers/customer.routes.js";
import { handlePurchase, handlePurchaseList } from "./modules/purchases/purchase.controller.js";
import { purchaseRoutes } from "./modules/purchases/purchase.routes.js";
import { handleExpense, handleExpenseList } from "./modules/expenses/expense.controller.js";
import { expenseRoutes } from "./modules/expenses/expense.routes.js";
import { handleInventoryList, handleProduct, handleProductList, handleStockAdjustment, handleStockCount } from "./modules/inventory/inventory.controller.js";
import { inventoryRoutes } from "./modules/inventory/inventory.routes.js";
import { handleReportSummary, handleReportSummaryGet } from "./modules/reports/report.controller.js";
import { reportRoutes } from "./modules/reports/report.routes.js";
import { handleCloseDaySummary, handleCloseDaySummaryGet, handleReconciliationHistory, handleReconciliationSubmit } from "./modules/reconciliation/reconciliation.controller.js";
import { reconciliationRoutes } from "./modules/reconciliation/reconciliation.routes.js";
import { workerRoutes } from "./modules/workers/worker.routes.js";
import { adminRoutes } from "./modules/admin/admin.routes.js";
import { accountRoutes } from "./modules/accounts/account.routes.js";
import { salesRoutes } from "./modules/sales/sales.routes.js";
import { HttpError } from "./shared/errors/http-error.js";
import { handleSendVerification, handleVerifyEmail } from "./modules/auth/email-verification.controller.js";
import { emailVerificationRoutes } from "./modules/auth/email-verification.routes.js";
import { logger } from "./shared/logging/logger.js";
import { passwordRoutes } from "./modules/auth/password.routes.js";
import { handlePasswordUpdate } from "./modules/auth/password.controller.js";

async function readBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { throw new HttpError(400, "INVALID_BODY", "Request body must be valid JSON"); }
}

function allowedOrigins(): Set<string> {
  const configured = process.env.FRONTEND_ORIGINS ?? process.env.FRONTEND_ORIGIN ?? "https://stockpadi-drab.vercel.app";
  return new Set(configured.split(",").map((origin) => origin.trim().replace(/\/$/, "")).filter(Boolean));
}

function jsonResponse(status: number, body: unknown, requestOrigin?: string) {
  const origin = requestOrigin?.replace(/\/$/, "");
  const headers = new Headers({
    "content-type": "application/json",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    vary: "Origin",
  });
  if (origin && allowedOrigins().has(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-credentials", "true");
  }
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}

export async function handleRequest(request: Request, pathnameOverride?: string): Promise<Response> {
  const startedAt = Date.now();
  const pathname = pathnameOverride ?? new URL(request.url).pathname;
  const requestOrigin = request.headers.get("origin") ?? undefined;
  logger.info("request started", { method: request.method, path: pathname });

  try {
    if (request.method === "OPTIONS") return jsonResponse(204, null, requestOrigin);
    if (request.method === "GET" && (pathname === "/" || pathname === "/health")) return jsonResponse(200, { status: "ok", service: "stockpadi-backend" }, requestOrigin);
    if (request.method === "GET" && pathname === workerRoutes.list.path) return jsonResponse(200, await handleWorkerList(request), requestOrigin);
    if (request.method === "GET" && pathname === inventoryRoutes.product) return jsonResponse(200, await handleProductList(request), requestOrigin);
    if (request.method === "GET" && pathname === inventoryRoutes.stock) return jsonResponse(200, await handleInventoryList(request), requestOrigin);
    if (request.method === "GET" && pathname === salesRoutes.list) return jsonResponse(200, await handleSalesList(request), requestOrigin);
    if (request.method === "GET" && pathname === expenseRoutes.list) return jsonResponse(200, await handleExpenseList(request), requestOrigin);
    if (request.method === "GET" && pathname === branchRoutes.list) return jsonResponse(200, await handleBranchList(request), requestOrigin);
    if (request.method === "GET" && pathname === purchaseRoutes.list) return jsonResponse(200, await handlePurchaseList(request), requestOrigin);
    if (request.method === "GET" && pathname === reportRoutes.summary) return jsonResponse(200, await handleReportSummaryGet(request), requestOrigin);
    if (request.method === "GET" && pathname === reconciliationRoutes.summary) return jsonResponse(200, await handleCloseDaySummaryGet(request), requestOrigin);
    if (request.method === "GET" && pathname === reconciliationRoutes.history) return jsonResponse(200, await handleReconciliationHistory(request), requestOrigin);
    if (request.method === "GET" && pathname.startsWith(customerRoutes.detailPrefix) && pathname !== customerRoutes.list) return jsonResponse(200, await handleCustomerDetail(request, pathname.slice(customerRoutes.detailPrefix.length)), requestOrigin);
    if (request.method === "GET" && pathname === workerRoutes.audit.path) return jsonResponse(200, await handleWorkerAudit(request), requestOrigin);
    if (request.method === "GET" && pathname.startsWith("/api/workers/") && pathname !== workerRoutes.audit.path) return jsonResponse(200, await handleWorkerMember(request, pathname.split("/").pop()!), requestOrigin);
    if (request.method !== "POST" && request.method !== "GET") return jsonResponse(404, { error: { code: "NOT_FOUND", message: "Route not found" } }, requestOrigin);

    const body = await readBody(request);
    if (pathname === emailVerificationRoutes.send) return jsonResponse(200, await handleSendVerification(request), requestOrigin);
    if (pathname === emailVerificationRoutes.verify) return jsonResponse(200, await handleVerifyEmail(request, body), requestOrigin);
    if (pathname === passwordRoutes.update) return jsonResponse(200, await handlePasswordUpdate(request, body), requestOrigin);
    if (pathname === workerRoutes.create.path) return jsonResponse(200, await handleWorkerRequest(request, body), requestOrigin);
    if (pathname === adminRoutes.path) return jsonResponse(200, await handleAdminRequest(request, body), requestOrigin);
    if (pathname === salesRoutes.path) return jsonResponse(200, await handleVoidSale(request, body), requestOrigin);
    if (pathname === accountRoutes.path) return jsonResponse(200, await handleAccountContext(request), requestOrigin);
    if (pathname === businessRoutes.path) return jsonResponse(200, await handleBusinessRegistration(request, body), requestOrigin);
    if (pathname === branchRoutes.create) return jsonResponse(200, await handleBranchCreate(request, body), requestOrigin);
    if (request.method === "GET" && pathname === customerRoutes.list) return jsonResponse(200, await handleCustomerList(request), requestOrigin);
    if (pathname === customerRoutes.create) return jsonResponse(200, await handleCustomerRequest(request, body), requestOrigin);
    if (pathname === customerRoutes.creditPayment) return jsonResponse(200, await handleCreditPaymentRequest(request, body), requestOrigin);
    if (pathname === purchaseRoutes.receive) return jsonResponse(200, await handlePurchase(request, body), requestOrigin);
    if (pathname === expenseRoutes.create) return jsonResponse(200, await handleExpense(request, body), requestOrigin);
    if (pathname === inventoryRoutes.product) return jsonResponse(200, await handleProduct(request, body), requestOrigin);
    if (pathname === inventoryRoutes.stockAdjustment) return jsonResponse(200, await handleStockAdjustment(request, body), requestOrigin);
    if (pathname === inventoryRoutes.stockCount) return jsonResponse(200, await handleStockCount(request, body), requestOrigin);
    if (pathname === reportRoutes.summary) return jsonResponse(200, await handleReportSummary(request, body), requestOrigin);
    if (pathname === reconciliationRoutes.summary) return jsonResponse(200, await handleCloseDaySummary(request, body), requestOrigin);
    if (pathname === reconciliationRoutes.submit) return jsonResponse(200, await handleReconciliationSubmit(request, body), requestOrigin);
    return jsonResponse(404, { error: { code: "NOT_FOUND", message: "Route not found" } }, requestOrigin);
  } catch (cause) {
    if (cause instanceof HttpError) {
      logger.warn("request rejected", { method: request.method, path: pathname, status: cause.status, code: cause.code, durationMs: Date.now() - startedAt });
      return jsonResponse(cause.status, { error: { code: cause.code, message: cause.message } }, requestOrigin);
    }
    logger.error("unhandled backend request error", { method: request.method, path: pathname, status: 500, durationMs: Date.now() - startedAt }, cause);
    return jsonResponse(500, { error: { code: "INTERNAL_ERROR", message: "Internal server error" } }, requestOrigin);
  }
}

async function nodeRequest(incoming: import("node:http").IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of incoming) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const body = chunks.length ? Buffer.concat(chunks).toString("utf8") : undefined;
  return new Request(`http://${incoming.headers.host ?? "localhost"}${incoming.url ?? "/"}`, {
    method: incoming.method,
    headers: incoming.headers as HeadersInit,
    ...(body === undefined ? {} : { body }),
  });
}

export function createApp() {
  return async (incoming: import("node:http").IncomingMessage, response: import("node:http").ServerResponse) => {
    const result = await handleRequest(await nodeRequest(incoming));
    result.headers.forEach((value, key) => response.setHeader(key, value));
    response.writeHead(result.status);
    response.end(Buffer.from(await result.arrayBuffer()));
  };
}
