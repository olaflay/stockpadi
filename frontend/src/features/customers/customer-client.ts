import { serverGet } from "@/features/operations/server-client";

export interface ServerCustomer { id: string; name: string; phone: string | null; updated_at: string; balance: number; }
export const fetchServerCustomers = () => serverGet<{ customers: ServerCustomer[] }>("/api/customers");
export const fetchServerCustomer = (id: string) => serverGet<{ customer: ServerCustomer; creditMovements: unknown[]; sales: unknown[] }>(`/api/customers/${encodeURIComponent(id)}`);
