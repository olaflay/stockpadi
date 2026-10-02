import { HttpError } from "../../shared/errors/http-error.js";

export interface RefundItemInput {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export interface RefundPaymentInput {
  method: "cash" | "transfer" | "pos_terminal" | "credit";
  amount: number;
}

export interface RefundSaleRequest {
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
    const quantity = Number(it.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new HttpError(400, "INVALID_BODY", `quantity must be a positive integer for item at index ${idx}`);
    }
    const unitPrice = Number(it.unitPrice);
    if (Number.isNaN(unitPrice) || unitPrice < 0) {
      throw new HttpError(400, "INVALID_BODY", `unitPrice must be a non-negative number for item at index ${idx}`);
    }
    return {
      productId: it.productId.trim(),
      quantity,
      unitPrice,
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
    saleId: body.saleId.trim(),
    reason: body.reason.trim(),
    items,
    payments,
  };
}
