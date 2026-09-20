import { serverGet } from "@/features/operations/server-client";

export interface ServerProduct { id: string; name: string; sku: string; barcode: string | null; sell_price: number; low_stock_threshold: number | null; }
export interface ServerStock { product_id: string; branch_id: string; quantity: number; }
export const fetchServerProducts = () => serverGet<{ products: ServerProduct[] }>("/api/products");
export const fetchServerInventory = () => serverGet<{ stock: ServerStock[]; branchIds: string[] }>("/api/inventory");
