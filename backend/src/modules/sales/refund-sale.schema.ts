import { HttpError } from "../../shared/errors/http-error.js";

export interface RefundItemInput {
  productId: string;
  quantity: number;
}

export interface RefundPaymentInput {
  method: "cash" | "transfer" | "pos_terminal" | "credit";
  amount: number;
}

export interface RefundSaleRequest {
  /** Stable client intent identity. It is the database idempotency key. */
  clientRefundId: string;
  saleId: string;
  reason: string;
  items: RefundItemInput[];
  payments: RefundPaymentInput[];
}

export function parseRefundSaleRequest(input: unknown): RefundSaleRequest {
  if (!input || typeof input !== "object") {
    throw new HttpError(400, "INVALID_BODY", "Request body must be an object");
  }
  const body = input as Record<string, unknown>;

  if (typeof body.saleId !== "string" || !body.saleId.trim()) {
    throw new HttpError(400, "INVALID_BODY", "saleId is required");
  }

  if (typeof body.clientRefundId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.clientRefundId.trim())) {
    throw new HttpError(400, "INVALID_BODY", "clientRefundId must be a valid UUID");
  }

  if (typeof body.reason !== "string" || !body.reason.trim()) {
    throw new HttpError(400, "INVALID_BODY", "reason is required and cannot be empty");
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new HttpError(400, "INVALID_BODY", "items array is required and cannot be empty");
  }

  const items: RefundItemInput[] = body.items.map((item, idx) => {
    if (!item || typeof item !== "object") {
      throw new HttpError(400, "INVALID_BODY", `Item at index ${idx} must be an object`);
    }
    const it = item as Record<string, unknown>;
    if (typeof it.productId !== "string" || !it.productId.trim()) {
      throw new HttpError(400, "INVALID_BODY", `productId is required for item at index ${idx}`);
    }
    if (Object.prototype.hasOwnProperty.call(it, "unitPrice")) {
      throw new HttpError(400, "INVALID_BODY", "Refund unitPrice is server-authoritative and must not be supplied");
    }
    const quantity = Number(it.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new HttpError(400, "INVALID_BODY", `quantity must be a positive integer for item at index ${idx}`);
    }
    return {
      productId: it.productId.trim(),
      quantity,
    };
  });

  if (!Array.isArray(body.payments) || body.payments.length === 0) {
    throw new HttpError(400, "INVALID_BODY", "payments array is required and cannot be empty");
  }

  const validMethods = new Set(["cash", "transfer", "pos_terminal", "credit"]);
  const payments: RefundPaymentInput[] = body.payments.map((payment, idx) => {
    if (!payment || typeof payment !== "object") {
      throw new HttpError(400, "INVALID_BODY", `Payment at index ${idx} must be an object`);
    }
    const p = payment as Record<string, unknown>;
    if (typeof p.method !== "string" || !validMethods.has(p.method)) {
      throw new HttpError(400, "INVALID_BODY", `Invalid payment method at index ${idx}`);
    }
    const amount = Number(p.amount);
    if (Number.isNaN(amount) || amount <= 0) {
      throw new HttpError(400, "INVALID_BODY", `Payment amount must be a positive number at index ${idx}`);
    }
    return {
      method: p.method as "cash" | "transfer" | "pos_terminal" | "credit",
      amount,
    };
  });

  return {
    clientRefundId: body.clientRefundId.trim(),
    saleId: body.saleId.trim(),
    reason: body.reason.trim(),
    items,
    payments,
  };
}
