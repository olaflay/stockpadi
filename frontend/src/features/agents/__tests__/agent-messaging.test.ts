import { describe, expect, it } from "vitest";
import { LocalAgentMessenger } from "@/features/agents/agent-messaging";

describe("AI Agent Messaging Adapter", () => {
  const messenger = new LocalAgentMessenger();

  it("formats owner daily digest message cleanly without hardcoding brand names", () => {
    const text = messenger.formatDailyDigestMessage({
      dateIso: "2026-10-02",
      totalSalesKobo: 5500000, // ₦55,000.00
      salesCount: 14,
      cashCollectedKobo: 4000000,
      debtCollectedKobo: 1000000,
      expensesKobo: 500000,
      lowStockItemsCount: 2,
    });

    expect(text).toContain("Daily Store Summary");
    expect(text).toContain("₦55,000.00 (14 transactions)");
    expect(text).toContain("₦40,000.00");
    expect(text).toContain("2 items need restock!");
    expect(text).not.toContain("Voice call");
  });

  it("formats debt reminder message and produces valid WhatsApp wa.me link", () => {
    const reminderText = messenger.formatDebtReminderMessage({
      customerName: "Alhaji Musa",
      customerPhone: "08012345678",
      totalOwedKobo: 1500000,
      currencySymbol: "₦",
      lastSaleDateIso: "2026-09-28",
    });

    expect(reminderText).toContain("Alhaji Musa");
    expect(reminderText).toContain("₦15,000.00");
    expect(reminderText).toContain("2026-09-28");

    const url = messenger.generateWhatsAppShareUrl("08012345678", reminderText);
    expect(url).toContain("https://wa.me/08012345678?text=");
    expect(url).toContain(encodeURIComponent("Alhaji Musa"));
  });
});
