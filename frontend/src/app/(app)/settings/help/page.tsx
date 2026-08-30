"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Modal";
import { RippleButton } from "@/components/ui/Ripple";
import { HelpCircle, FileText, MessageCircle, ChevronRight, ChevronDown, Mail, Star, HeartHandshake } from "lucide-react";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

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
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [rating, setRating] = useState<number>(5);
  const [feedbackText, setFeedbackText] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  function handleSendReview() {
    setSubmittingReview(true);
    // WhatsApp feedback submission or local toast confirmation
    const message = `*StockPadi Review & Merchant Feedback*\nRating: ${rating}/5 stars\nFeedback: ${feedbackText.trim() || "Loving the offline speed and simplicity!"}`;
    window.open(buildWhatsAppUrl(undefined, message), "_blank");
    showToast("Thank you for your feedback!", "success");
    setSubmittingReview(false);
    setReviewModalOpen(false);
    setFeedbackText("");
  }

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader title="Help & Support" onBack={() => router.back()} />

      {/* Review & Merchant Feedback Banner */}
      <section className="flex flex-col gap-3 rounded-[var(--radius-focus-block)] border border-border bg-brand-accent/8 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-accent/20 text-brand-accent">
            <HeartHandshake size={22} aria-hidden />
          </div>
          <div>
            <h3 className="text-[length:var(--font-size-body)] font-semibold text-on-surface">Enjoying StockPadi?</h3>
            <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
              Help us make it better for all retail shop owners.
            </p>
          </div>
        </div>
        <RippleButton
          type="button"
          onClick={() => setReviewModalOpen(true)}
          className="mt-1 flex min-h-[var(--touch-target-min)] w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-brand-accent px-4 text-[length:var(--font-size-body-sm)] font-semibold text-brand-accent-contrast hover:opacity-95 transition-opacity"
        >
          <Star size={16} className="fill-current" />
          <span>Leave a Review / Suggest Feature</span>
        </RippleButton>
      </section>

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
          <a
            href={buildWhatsAppUrl(undefined, "Hi StockPadi Team, I have a question about my shop inventory...")}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-[var(--touch-target-min)] items-center gap-3 px-4 py-3 text-left hover:bg-surface-container transition-colors"
          >
            {/* #25D366 is WhatsApp's own brand color, not a design-system token — same exception as the Google "G" logo elsewhere in the app. */}
            <MessageCircle size={20} className="text-[#25D366]" aria-hidden />
            <div className="flex-1">
              <span className="block text-[length:var(--font-size-body)] font-medium text-on-surface">
                WhatsApp Support
              </span>
              <span className="block text-[length:var(--font-size-caption)] text-on-surface-muted">
                Direct chat with our team
              </span>
            </div>
            <ChevronRight size={18} className="text-on-surface-muted" aria-hidden />
          </a>

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

      {/* Review Modal */}
      <Modal isOpen={reviewModalOpen} onClose={() => setReviewModalOpen(false)} title="Share Your Review">
        <div className="flex flex-col gap-4 py-2">
          <p className="text-[length:var(--font-size-body)] text-on-surface-muted text-center">
            How is your experience with StockPadi so far?
          </p>

          <div className="flex items-center justify-center gap-3 py-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                className="p-1 text-2xl transition-transform hover:scale-110 active:scale-95"
                aria-label={`${star} star`}
              >
                <Star
                  size={32}
                  className={star <= rating ? "fill-warning text-warning" : "text-on-surface-muted/30"}
                />
              </button>
            ))}
          </div>

          <label className="flex flex-col gap-1 text-left">
            <span className="text-[length:var(--font-size-label)] font-medium text-on-surface">
              What do you love or want improved? (Optional)
            </span>
            <textarea
              rows={3}
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="e.g. Really love the WhatsApp receipts, would love to see..."
              className="w-full rounded-[var(--radius-control)] border border-border bg-surface p-3 text-[length:var(--font-size-body)] text-on-surface placeholder:text-on-surface-muted"
            />
          </label>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setReviewModalOpen(false)}
              className="flex-1 min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] border border-border px-4 text-[length:var(--font-size-body)] font-medium text-on-surface hover:bg-surface-container transition-colors"
            >
              Cancel
            </button>
            <RippleButton
              type="button"
              onClick={handleSendReview}
              disabled={submittingReview}
              className="flex-1 min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] bg-brand-accent px-4 text-[length:var(--font-size-body)] font-semibold text-brand-accent-contrast hover:opacity-95 transition-opacity"
            >
              Send Feedback
            </RippleButton>
          </div>
        </div>
      </Modal>

      <div className="mt-8 text-center text-[length:var(--font-size-caption)] text-on-surface-muted">
        StockPadi v1.0.0
      </div>
    </div>
  );
}
