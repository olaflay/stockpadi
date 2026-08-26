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

async function readBody(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new HttpError(400, "INVALID_BODY", "Request body must be valid JSON"); }
}

function allowedOrigins(): Set<string> {
  const configured = process.env.FRONTEND_ORIGINS ?? process.env.FRONTEND_ORIGIN ?? "https://stockpadi-drab.vercel.app";
  return new Set(configured.split(",").map((origin) => origin.trim().replace(/\/$/, "")).filter(Boolean));
}

function send(response: import("node:http").ServerResponse, status: number, body: unknown, requestOrigin?: string) {
  const origin = requestOrigin?.replace(/\/$/, "");
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    vary: "Origin",
  };
  if (origin && allowedOrigins().has(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-credentials"] = "true";
  }
  response.writeHead(status, {
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function requestFor(incoming: import("node:http").IncomingMessage, body?: unknown) {
  return new Request(`http://${incoming.headers.host ?? "localhost"}${incoming.url ?? "/"}`, { method: incoming.method, headers: incoming.headers as HeadersInit, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

export function createApp() {
  return async (incoming: import("node:http").IncomingMessage, response: import("node:http").ServerResponse) => {
    const startedAt = Date.now();
    const requestPath = incoming.url ?? "/";
    const requestOrigin = typeof incoming.headers.origin === "string" ? incoming.headers.origin : undefined;
    const normalizedOrigin = requestOrigin?.replace(/\/$/, "");
    if (normalizedOrigin && allowedOrigins().has(normalizedOrigin)) {
      response.setHeader("access-control-allow-origin", normalizedOrigin);
      response.setHeader("access-control-allow-credentials", "true");
    }
    response.setHeader("access-control-allow-headers", "authorization, content-type");
    response.setHeader("access-control-allow-methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    response.setHeader("vary", "Origin");
    logger.info("request started", { method: incoming.method, path: requestPath });
    try {
      if (incoming.method === "OPTIONS") return send(response, 204, null, requestOrigin);
      if (incoming.method === "GET" && incoming.url === "/health") return send(response, 200, { status: "ok", service: "stockpadi-backend" }, requestOrigin);
      if (incoming.method === "GET" && incoming.url === workerRoutes.list.path) return send(response, 200, await handleWorkerList(requestFor(incoming)));
      if (incoming.method === "GET" && incoming.url === inventoryRoutes.product) return send(response, 200, await handleProductList(requestFor(incoming)));
      if (incoming.method === "GET" && incoming.url === inventoryRoutes.stock) return send(response, 200, await handleInventoryList(requestFor(incoming)));
      if (incoming.method === "GET" && incoming.url === salesRoutes.list) return send(response, 200, await handleSalesList(requestFor(incoming)));
      if (incoming.method === "GET" && incoming.url === expenseRoutes.list) return send(response, 200, await handleExpenseList(requestFor(incoming)));
      if (incoming.method === "GET" && incoming.url === branchRoutes.list) return send(response, 200, await handleBranchList(requestFor(incoming)));
      if (incoming.method === "GET" && incoming.url === purchaseRoutes.list) return send(response, 200, await handlePurchaseList(requestFor(incoming)));
      if (incoming.method === "GET" && incoming.url?.split("?")[0] === reportRoutes.summary) return send(response, 200, await handleReportSummaryGet(requestFor(incoming)));
      if (incoming.method === "GET" && incoming.url === reconciliationRoutes.summary) return send(response, 200, await handleCloseDaySummaryGet(requestFor(incoming)));
      if (incoming.method === "GET" && incoming.url === reconciliationRoutes.history) return send(response, 200, await handleReconciliationHistory(requestFor(incoming)));
      if (incoming.method === "GET" && incoming.url?.startsWith(customerRoutes.detailPrefix) && incoming.url !== customerRoutes.list) return send(response, 200, await handleCustomerDetail(requestFor(incoming), incoming.url.slice(customerRoutes.detailPrefix.length)));
      if (incoming.method === "GET" && incoming.url === workerRoutes.audit.path) return send(response, 200, await handleWorkerAudit(requestFor(incoming)));
      if (incoming.method === "GET" && incoming.url?.startsWith("/api/workers/") && incoming.url !== workerRoutes.audit.path) return send(response, 200, await handleWorkerMember(requestFor(incoming), incoming.url.split("/").pop()!));
      if (incoming.method !== "POST" && incoming.method !== "GET") return send(response, 404, { error: { code: "NOT_FOUND", message: "Route not found" } });
      const body = await readBody(incoming);
      if (incoming.url === emailVerificationRoutes.send) return send(response, 200, await handleSendVerification(requestFor(incoming)));
      if (incoming.url === emailVerificationRoutes.verify) return send(response, 200, await handleVerifyEmail(requestFor(incoming, body), body));
      if (incoming.url === passwordRoutes.update) return send(response, 200, await handlePasswordUpdate(requestFor(incoming, body), body));
      if (incoming.url === workerRoutes.create.path) return send(response, 200, await handleWorkerRequest(requestFor(incoming, body), body));
      if (incoming.url === adminRoutes.path) return send(response, 200, await handleAdminRequest(requestFor(incoming, body), body));
      if (incoming.url === salesRoutes.path) return send(response, 200, await handleVoidSale(requestFor(incoming, body), body));
      if (incoming.url === accountRoutes.path) return send(response, 200, await handleAccountContext(requestFor(incoming)));
      if (incoming.url === businessRoutes.path) return send(response, 200, await handleBusinessRegistration(requestFor(incoming, body), body));
      if (incoming.url === branchRoutes.create) return send(response, 200, await handleBranchCreate(requestFor(incoming, body), body));
      if (incoming.method === "GET" && incoming.url === customerRoutes.list) return send(response, 200, await handleCustomerList(requestFor(incoming)));
      if (incoming.url === customerRoutes.create) return send(response, 200, await handleCustomerRequest(requestFor(incoming, body), body));
      if (incoming.url === customerRoutes.creditPayment) return send(response, 200, await handleCreditPaymentRequest(requestFor(incoming, body), body));
      if (incoming.url === purchaseRoutes.receive) return send(response, 200, await handlePurchase(requestFor(incoming, body), body));
      if (incoming.url === expenseRoutes.create) return send(response, 200, await handleExpense(requestFor(incoming, body), body));
      if (incoming.url === inventoryRoutes.product) return send(response, 200, await handleProduct(requestFor(incoming, body), body));
      if (incoming.url === inventoryRoutes.stockAdjustment) return send(response, 200, await handleStockAdjustment(requestFor(incoming, body), body));
      if (incoming.url === inventoryRoutes.stockCount) return send(response, 200, await handleStockCount(requestFor(incoming, body), body));
      if (incoming.url === reportRoutes.summary) return send(response, 200, await handleReportSummary(requestFor(incoming, body), body));
      if (incoming.url === reconciliationRoutes.summary) return send(response, 200, await handleCloseDaySummary(requestFor(incoming, body), body));
      if (incoming.url === reconciliationRoutes.submit) return send(response, 200, await handleReconciliationSubmit(requestFor(incoming, body), body));
      return send(response, 404, { error: { code: "NOT_FOUND", message: "Route not found" } });
    } catch (cause) {
      if (cause instanceof HttpError) {
        logger.warn("request rejected", { method: incoming.method, path: requestPath, status: cause.status, code: cause.code, durationMs: Date.now() - startedAt });
        return send(response, cause.status, { error: { code: cause.code, message: cause.message } });
      }
      logger.error("unhandled backend request error", { method: incoming.method, path: requestPath, status: 500, durationMs: Date.now() - startedAt }, cause);
      return send(response, 500, { error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
    }
  };
}
