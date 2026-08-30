# SPEC: Growth & Trust Onboarding (Marketing + Sales + Education)

| | |
| --- | --- |
| Status | DRAFT for SPEC gate |
| Feature | Master audit row 2 (P0) + row 2b (P1, the gate) |
| References | `docs/improvements/02-growth-onboarding-experience.md`, `docs/research/onboarding-design-m3.md` |
| Date | 2026-08-25 (Updated 2026-08-30) |

## 1. DOUBT — why this, why now

**The evidence:** Kippa locked ~500,000 merchants out of their own records (Grade A, TechCabal/Launch Base); Bumpa's own blog says "No. Bumpa is not a free app" (Grade A); Tracepos's 14 questions exist to trigger a manual sales call, not to onboard (screens analysis, this project). The free-forever, offline, exportable promise is the wedge, and it is currently a Settings screen, not an onboarding moment. PRD §18's airplane-mode proof — "the best idea in the PRD" — is still unbuilt.

**Verdict:** BUILD, P0 for the combined marketing, sales, and education onboarding flow; the backend gate (activation) ships with row 2b.

## 2. Objective

A new signup experiences a seamless, minimalist 4-step onboarding flow blending:
1. **Marketing:** Plain-language trust wedge ("Works offline. Your records stay on this device. Export them any time.").
2. **Sales / Conversion:** 1-tap business template selection, prefilled starter inventory, live profit margin calculator.
3. **Education:** Interactive micro-learning for the 3 superpowers (Offline Till, WhatsApp Debt Recovery, Nightly Reconciliation).
4. **Minimalism:** Samsung One UI thumb reach layout, M3 tonal chips, discrete progress dots, non-blocking Skip/Back.

**Success criteria (measurable):**

- Full setup completed in under 60 seconds.
- Starter catalog with 3 verified products loaded with 1 tap.
- Live profit margin badge updates dynamically on input.
- Every screen has Skip/Back — zero dead ends.
- 100% offline-first execution via Dexie transactions (0 network latency).

## 3. The flow (decided)

1. **Step 1: Trust & Value (Marketing):** "Your shop, on your phone." + the Kippa-trust sentence + Business name input.
2. **Step 2: Business Vertical (Sales):** Tonal chips (Grocery, Pharmacy, Electronics, General Retail) with live notes + instant 1-tap "Load starter inventory" toggle.
3. **Step 3: First Product (Sales & Education):** 3 sentence-case fields (Name, Cost Price, Selling Price) with dynamic profit margin badge (`Profit: ₦X (Y%)`) + "Use sample product" prefill.
4. **Step 4: The 3 Superpowers & Launch (Education):** 3 interactive micro-cards (Offline Till, WhatsApp Debt Recovery, Nightly Reconcile) + primary CTA "Launch Till" / "Open Dashboard".

## 4. Rules

1. Data written: `businessProfile`, `categories`, `branches`, `products`, `stockMovements` (if sample or first product selected).
2. Status lifecycle: `pending` → `activated` (admin) when backend gate is active; local fallback instantly functional.
3. The GuidedTour (8-step spotlight) is **absorbed**: replaced by this high-impact, contextual walk. Emoji titles 🎉📦🧾 banned.
4. Copy is plain language, zero intensifiers, no em dashes (zero-ai-slop §2).
5. Performance: 100% Dexie-local; zero network calls on the critical onboarding path.

## 5. Data & boundaries

- Local tables: `businessProfile`, `categories`, `branches`, `products`, `stockMovements`.
- **Never:** camera permission prompts during onboarding; revenue/team-size intrusive questions; dead-end error screens.

## 6. Verification

1. Fresh install → walk through 4 steps → sample products created → POS shows items ready for instant sale.
2. Skip from any step writes valid defaults (`general_retail`) and redirects cleanly to `/dashboard`.
3. Unit tests in `frontend/src/features/onboarding/__tests__/onboarding-flow.test.ts`.

## 7. Next gates

PLAN → BUILD → VERIFY (§6) → REVIEW.

