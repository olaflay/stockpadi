export interface Supplier {
  id: string;
  businessId?: string;
  name: string;
  phone: string | null;
  updatedAt: string;
}

export interface PurchaseItem {
  productId: string;
  quantity: number;
  unitCost: number;
  /**
   * Same value as the paired stock_movements row's clientId, mirroring
   * SaleItem.movementClientId — see .agents/rules/offline-sync-and-ledger.md.
   */
  movementClientId: string;
}

export interface Purchase {
  id: string;
  businessId?: string;
  clientId: string;
  branchId: string;
  supplierId: string;
  items: PurchaseItem[];
  createdAtLocal: string;
  createdAt: string;
  createdByUserId: string;
}
