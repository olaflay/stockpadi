"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useToast } from "@/components/ui/Toast";
import { HelpCircle, FileText, MessageCircle, ChevronRight, ChevronDown, Mail } from "lucide-react";

const USER_GUIDE_STEPS = [
  { title: "Add your products", body: "Products → the + button. Set a cost price and sell price; starting stock is optional." },
  { title: "Make a sale", body: "Sell tab → tap a product to add it to the cart → Complete sale. Works fully offline; it syncs once you're back online." },
  { title: "Track what's owed", body: "Tag a sale as Credit at checkout to link it to a customer. Their balance shows on the Customers screen." },
  { title: "Close out your day", body: "Reports → Close day (guided) — counts your cash and shows what you made today." },
];

const FAQS = [
  { q: "Do I need the internet to make a sale?", a: "No. Sales, stock updates, and daily totals all work fully offline and sync automatically the next time you're online." },
  { q: "Why is a product showing as low stock?", a: "Each product has a low-stock threshold — the default is 5, but you can set a custom one per product on its edit screen." },
  { q: "How do I access the app?", a: "Sign in through the normal login screen with your email and password. Workers receive their generated password by email from the Business Owner." },
  { q: "Can more than one person use the app?", a: "Yes — the Business Owner can add Workers under Staff & Access. Each Worker receives their own generated password and permissions." },
];

export default function HelpPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [userGuideOpen, setUserGuideOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader title="Help & Support" onBack={() => router.back()} />

      <section>
        <h2 className="mb-3 px-1 text-[length:var(--font-size-label)] font-medium text-on-surface-muted uppercase tracking-wider">
          Resources
        </h2>
        <div className="flex flex-col divide-y divide-border overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
          <button
            type="button"
            onClick={() => setUserGuideOpen((v) => !v)}
            aria-expanded={userGuideOpen}
            className="flex min-h-[var(--touch-target-min)] items-center gap-3 px-4 py-3 text-left hover:bg-surface-container transition-colors"
          >
            <FileText size={20} className="text-on-surface-muted" aria-hidden />
            <div className="flex-1">
              <span className="block text-[length:var(--font-size-body)] font-medium text-on-surface">
                User Guide
              </span>
              <span className="block text-[length:var(--font-size-caption)] text-on-surface-muted">
                Learn how to use StockPadi
              </span>
            </div>
            {userGuideOpen ? (
              <ChevronDown size={18} className="text-on-surface-muted" aria-hidden />
            ) : (
              <ChevronRight size={18} className="text-on-surface-muted" aria-hidden />
            )}
          </button>
          {userGuideOpen && (
            <div className="flex flex-col gap-3 bg-surface-container/40 px-4 py-4">
              {USER_GUIDE_STEPS.map((step) => (
                <div key={step.title}>
                  <p className="text-[length:var(--font-size-body)] font-medium text-on-surface">{step.title}</p>
                  <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">{step.body}</p>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setFaqOpen((v) => !v)}
            aria-expanded={faqOpen}
            className="flex min-h-[var(--touch-target-min)] items-center gap-3 px-4 py-3 text-left hover:bg-surface-container transition-colors"
          >
            <HelpCircle size={20} className="text-on-surface-muted" aria-hidden />
            <div className="flex-1">
              <span className="block text-[length:var(--font-size-body)] font-medium text-on-surface">
                FAQs
              </span>
              <span className="block text-[length:var(--font-size-caption)] text-on-surface-muted">
                Answers to common questions
              </span>
            </div>
            {faqOpen ? (
              <ChevronDown size={18} className="text-on-surface-muted" aria-hidden />
            ) : (
              <ChevronRight size={18} className="text-on-surface-muted" aria-hidden />
            )}
          </button>
          {faqOpen && (
            <div className="flex flex-col gap-3 bg-surface-container/40 px-4 py-4">
              {FAQS.map((item) => (
                <div key={item.q}>
                  <p className="text-[length:var(--font-size-body)] font-medium text-on-surface">{item.q}</p>
                  <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">{item.a}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 px-1 text-[length:var(--font-size-label)] font-medium text-on-surface-muted uppercase tracking-wider">
          Contact Us
        </h2>
        <div className="flex flex-col divide-y divide-border overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
          <button
            type="button"
            onClick={() => showToast("WhatsApp support isn't set up yet — try Email Support below.", "neutral")}
            className="flex min-h-[var(--touch-target-min)] items-center gap-3 px-4 py-3 text-left hover:bg-surface-container transition-colors"
          >
            {/* #25D366 is WhatsApp's own brand color, not a design-system token — same exception as the Google "G" logo elsewhere in the app. */}
            <MessageCircle size={20} className="text-[#25D366]" aria-hidden />
            <div className="flex-1">
              <span className="block text-[length:var(--font-size-body)] font-medium text-on-surface">
                WhatsApp Support
              </span>
              <span className="block text-[length:var(--font-size-caption)] text-on-surface-muted">
                Available Mon-Fri, 9am-5pm
              </span>
            </div>
          </button>

          <a
            href="mailto:support@stockpadi.com"
            className="flex min-h-[var(--touch-target-min)] items-center gap-3 px-4 py-3 text-left hover:bg-surface-container transition-colors"
          >
            <Mail size={20} className="text-on-surface-muted" aria-hidden />
            <div className="flex-1">
              <span className="block text-[length:var(--font-size-body)] font-medium text-on-surface">
                Email Support
              </span>
              <span className="block text-[length:var(--font-size-caption)] text-on-surface-muted">
                support@stockpadi.com
              </span>
            </div>
          </a>
        </div>
      </section>

      <div className="mt-8 text-center text-[length:var(--font-size-caption)] text-on-surface-muted">
        StockPadi v1.0.0
      </div>
    </div>
  );
}
