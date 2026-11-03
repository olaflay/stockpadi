/**
 * Moving Weighted Average Cost Calculation (IAS 2 paras 25 & 27).
 *
 * TRUST Promise 4 & Locked Decision 9:
 * Cost of Goods Sold is calculated using the moving weighted average cost at the
 * moment of sale. When new delivery stock arrives via restocking, the product's
 * cost price updates according to:
 *
 * If existing stock on hand <= 0:
 *   newCostPrice = restockUnitCost
 * Else:
 *   newCostPrice = round(((currentStock * currentCostPrice) + (restockQuantity * restockUnitCost)) / (currentStock + restockQuantity), 2)
 *
 * Rules:
 * 1. Zero/Negative stock on hand: Offline sales can cause temporary negative stock
 *    prior to restock sync. In this state, existing stock has zero asset balance carryover;
 *    the incoming restock establishes the clean cost basis.
 * 2. Minor Currency Quantization: Quantized to 2 decimal places (kobo).
 * 3. Invariants: Returns a non-negative finite number. Historical sale line cost
 *    snapshots are never mutated.
 */

export interface MovingAverageCostParams {
  currentStock: number;
  currentCostPrice: number;
  restockQuantity: number;
  restockUnitCost: number;
}

export function calculateMovingAverageCost(params: MovingAverageCostParams): number {
  const { currentStock, currentCostPrice, restockQuantity, restockUnitCost } = params;

  if (restockQuantity <= 0) {
    return Math.max(0, Math.round((currentCostPrice || 0) * 100) / 100);
  }
  if (!Number.isFinite(restockUnitCost) || restockUnitCost < 0) {
    throw new Error("Restock unit cost must be a non-negative finite number.");
  }

  // Quantize restock unit cost
  const sanitizedRestockCost = Math.round(restockUnitCost * 100) / 100;

  // Boundary condition: zero or negative inventory on hand
  if (currentStock <= 0) {
    return sanitizedRestockCost;
  }

  const sanitizedCurrentCost = Math.max(0, Number.isFinite(currentCostPrice) ? currentCostPrice : 0);
  const existingAssetValue = currentStock * sanitizedCurrentCost;
  const incomingAssetValue = restockQuantity * sanitizedRestockCost;
  const totalStock = currentStock + restockQuantity;

  if (totalStock <= 0) {
    return sanitizedRestockCost;
  }

  const rawWeightedAverage = (existingAssetValue + incomingAssetValue) / totalStock;
  return Math.round(rawWeightedAverage * 100) / 100;
}

