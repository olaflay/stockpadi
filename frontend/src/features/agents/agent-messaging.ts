/**
 * AI Agent Messaging Adapter (Ports and Adapters Architecture)
 * 
 * Defines the contract for asynchronous text-based store intelligence.
 * Strictly text-based (WhatsApp text templates, SMS, push notifications, daily markdown digests).
 * 
 * CONSTRAINTS:
 * - NO voice calling capabilities. Strictly text notifications and summaries.
 * - 100% white-label: Always consumes getBrandingConfig() for business and product names.
 */

import { getBrandingConfig } from "@/config/branding";

export interface OwnerDailyDigestPayload {
  ownerPhone?: string;
  businessName?: string;
  dateIso: string;
  totalSalesKobo: number;
  salesCount: number;
  cashCollectedKobo: number;
  debtCollectedKobo: number;
  expensesKobo: number;
  lowStockItemsCount: number;
}

export interface DebtReminderPayload {
  customerName: string;
  customerPhone: string;
  totalOwedKobo: number;
  currencySymbol: string;
  lastSaleDateIso?: string;
}

export interface IAgentMessenger {
  formatDailyDigestMessage(payload: OwnerDailyDigestPayload): string;
  formatDebtReminderMessage(payload: DebtReminderPayload): string;
  generateWhatsAppShareUrl(phone: string, text: string): string;
}

export class LocalAgentMessenger implements IAgentMessenger {
  formatDailyDigestMessage(payload: OwnerDailyDigestPayload): string {
    const branding = getBrandingConfig();
    const storeName = payload.businessName || branding.businessName;
    const salesNaira = (payload.totalSalesKobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 });
    const cashNaira = (payload.cashCollectedKobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 });
    const debtRecNaira = (payload.debtCollectedKobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 });
    const expenseNaira = (payload.expensesKobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 });

    return [
      `📊 *${storeName} — Daily Store Summary*`,
      `📅 Date: ${payload.dateIso}`,
      ``,
      `💰 *Total Sales*: ₦${salesNaira} (${payload.salesCount} transactions)`,
      `💵 *Cash Received*: ₦${cashNaira}`,
      `🤝 *Debts Collected*: ₦${debtRecNaira}`,
      `💸 *Cash Expenses*: ₦${expenseNaira}`,
      payload.lowStockItemsCount > 0 ? `⚠️ *Low Stock Alert*: ${payload.lowStockItemsCount} items need restock!` : `✅ *Stock*: All levels healthy`,
      ``,
      `_Generated automatically by ${branding.businessName}_`,
    ].join("\n");
  }

  formatDebtReminderMessage(payload: DebtReminderPayload): string {
    const branding = getBrandingConfig();
    const amountStr = `${payload.currencySymbol}${(payload.totalOwedKobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

    return [
      `Hello ${payload.customerName},`,
      ``,
      `This is a friendly reminder from *${branding.businessName}* regarding your pending balance of *${amountStr}*.`,
      payload.lastSaleDateIso ? `Invoice record date: ${payload.lastSaleDateIso}.` : "",
      ``,
      `Kindly arrange payment at your earliest convenience. Thank you for your continued patronage!`,
    ].filter(Boolean).join("\n");
  }

  generateWhatsAppShareUrl(phone: string, text: string): string {
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    const encoded = encodeURIComponent(text);
    return cleanPhone.length > 0
      ? `https://wa.me/${cleanPhone}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;
  }
}

export const defaultAgentMessenger = new LocalAgentMessenger();
