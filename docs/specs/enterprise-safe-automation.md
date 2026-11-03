# Enterprise-safe automation and identity experiments

| | |
| --- | --- |
| Status | DISCOVERY — not approved for build |
| Governing promises | TRUST 1–6, 8–10 |
| Precondition | Launch reliability gates closed; representative merchant research completed |

These designs preserve the useful outcome of previously rejected ideas while removing silent,
irreversible, or unauditable behaviour. None is a launch commitment.

## 1. Enterprise Voice Drafting

**Purpose:** help a cashier find products and assemble a draft faster while keeping the existing
search, scanner, and cart as the authority.

**Safe flow:** press and hold → speak a short command → show transcript and candidate lines → cashier
confirms or edits every uncertain line → add confirmed lines to the ordinary cart. Voice never
completes checkout, chooses a payment method, changes a price, creates a product, adjusts stock, or
writes a ledger record.

**Architecture:**

- Feature-detect speech recognition; never assume browser support.
- Prefer supported on-device recognition. If cloud recognition is offered, obtain explicit consent,
  disclose the processor and retention policy, and never upload audio silently.
- Use a constrained intent schema (`search`, `product candidate`, `quantity`, `unit`) and deterministic
  catalogue matching. The model/transcriber does not receive a mutation tool.
- Display the raw transcript, matched product, quantity, unit, confidence, and alternatives.
- Treat price words as search context only; the authoritative catalogue supplies the price.
- Do not retain raw audio by default. Audit the accepted structured draft, actor, corrections, model
  or engine version, and timestamp without recording unnecessary speech content.
- Provide identical completion through touch/search when unavailable, offline, denied, or uncertain.
- Remote kill switch disables voice without affecting POS.

**Entry gates:**

- At least 20 representative merchants say the workflow solves a repeated rush-hour problem.
- Test set covers supported Nigerian English accents, mixed-language product names, shop noise,
  similarly named SKUs, pack/carton units, and low-end 2 GB Android devices.
- At least 98% exact product-and-quantity accuracy on the supported command set after confirmation;
  zero unconfirmed cart mutations and zero direct financial/ledger writes.
- P95 result display within 1.5 seconds for on-device and 3 seconds for consented cloud processing.
- At least 20% faster than touch search for the validated tasks without a higher correction rate.

**Kill criteria:** any unconfirmed mutation, privacy-policy breach, material accessibility regression,
or failure to beat touch search during the pilot.

Browser speech recognition is not universally available and may use a server-side service, so this
cannot be the only path: [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).

## 2. Read-only Operations Copilot

**Purpose:** answer questions such as “Why is this stock number low?” or “Show the sales behind this
total” using records the signed-in role is already allowed to read.

**Boundaries:**

- Read-only retrieval tools only; no create, update, delete, sync acknowledgement, export, message,
  role, refund, void, payment, or ledger tool.
- Every numeric claim links to the exact records and deterministic calculation used.
- “Unknown” is required when data is incomplete. The assistant cannot fill missing cost, price,
  payment, customer, or stock facts.
- Server-side tenant and role enforcement applies independently of the prompt.
- Prompt-injection tests cover product names, notes, imported CSV content, and receipt text.
- Responses and source IDs are auditable; sensitive values are redacted from telemetry.
- Remote kill switch and per-business opt-in are mandatory.

**Entry gates:** 100% authorization isolation in adversarial tests; 100% citation coverage for numeric
claims; zero mutation-capable tools; representative evaluation reaches the agreed factuality target
before pilot. NIST calls for scoped tasks, documented human oversight, measurement, and continuous
risk management: [NIST AI RMF Core](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/).

## 3. Scenario planner, not financial prediction

The product may let an owner enter explicit assumptions such as expected sales change, expense
change, or supplier price increase. It then performs deterministic calculations and labels every
result **Scenario — not a forecast**. It never changes the books, hides its assumptions, or presents
generated numbers as observed facts. Predictive forecasting remains disabled until clean-history,
calibration, confidence-interval, and back-testing gates are defined and passed.

## 4. Passkeys without stored biometrics

Online sign-in may use WebAuthn/passkeys after device and recovery testing. The authenticator—not
the application—performs local PIN or biometric verification; the application stores a public-key
credential, not a fingerprint or face template. Offline shared-device switching continues to use
the accepted staff identity model and PIN. Recovery, revocation, lost-device, role-change, and audit
flows must exist before pilot. See the [W3C WebAuthn specification](https://www.w3.org/TR/webauthn/).

## 5. Explicitly still excluded

- Live card/wallet processing: conflicts with the locked payment-tag and PCI boundary.
- Autonomous financial or ledger writes.
- Voice-triggered checkout, refunds, voids, price changes, or stock adjustments.
- Employee surveillance, emotion inference, continuous listening, or retained raw audio by default.
- AI accusations of theft or misconduct.
- LLM verification of transfers or payment evidence.
