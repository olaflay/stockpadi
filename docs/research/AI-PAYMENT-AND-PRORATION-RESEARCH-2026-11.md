# AI payment layer and proration research — November 2026

**Routing tags:** `AI_IMPLEMENTATION_PRIMARY`, `AI_PAYMENT_PRORATION`

**Authority:** Research and implementation constraints only. `AGENTS.md`, the TRUST Standard, `docs/COSTING-AND-PRICING.md`, and `.agents/rules/payment-and-pci-scope.md` remain controlling.

**Scope boundary:** The current product records `cash`, `transfer`, `POS terminal`, and `credit` as payment-method tags. It does not accept, process, store, transmit, or verify live card or wallet payments. Nothing in this note authorizes changing that boundary.

## Decision summary

“Payment layer” is not one calculation. It must remain five explicit domains:

1. **Sale tender allocation:** amounts assigned to payment-method tags; their sum must equal the immutable sale total.
2. **Cash tendering:** cash physically received and change due; `tenderedAmount` is metadata and is never part of sale-total proration.
3. **Customer/supplier debt settlement:** append-only balance movements; a repayment is not sales revenue.
4. **Purchase landed-cost allocation:** freight, handling, and other eligible acquisition costs allocated deterministically to inventory lines before moving-average cost is updated.
5. **Future regulated payment processing:** a separate, explicitly approved integration through a licensed provider/hosted surface; raw card data must never enter this application.

An AI system may extract or propose values for these domains, but it must never merge them, calculate silently with model output, or write directly to a ledger.

## Accounting and regulatory evidence

- IAS 2 says inventory cost includes purchase, conversion, and other costs incurred to bring inventory to its present location and condition. It permits weighted average for ordinarily interchangeable inventory. This supports deterministic landed-cost allocation feeding the existing moving-average calculation. [IFRS Foundation — IAS 2](https://www.ifrs.org/issued-standards/list-of-standards/ias-2-inventories/)
- PCI SSC warns that outsourcing payment processing does not remove all merchant security responsibilities, including for sites that do not directly process cardholder data. A future hosted integration therefore needs its own current PCI assessment; “the provider handles it” is not sufficient. [PCI SSC FAQ 1292](https://www.pcisecuritystandards.org/faqs/1292/)
- CBN publishes licensed payment-service-provider categories and supervises the Nigerian payment system. Any future transfer verification, terminal integration, collection, or settlement product must use a currently licensed provider and be rechecked at selection time. [CBN payment-service providers](https://www.cbn.gov.ng/PaymentsSystem/PSPs.html), [CBN payment-system supervision](https://www.cbn.gov.ng/PaymentsSystem/)
- Payment references, payer identity, recordings, images, and provider payloads can be personal data. Lawful basis, purpose limitation, minimisation, retention, security, and data-subject information must be reviewed under the Nigeria Data Protection Act. Engineering cannot self-certify legal compliance. [Nigeria Data Protection Act 2023](https://ndpc.gov.ng/wp-content/uploads/2024/03/Nigeria_Data_Protection_Act_2023.pdf)

## Deterministic proration contract

All future proration must operate on integer minor units at the calculation boundary. The current repository still contains decimal/JavaScript-number money, so this contract is a migration target rather than permission to reinterpret historical records.

For a total amount `T` and eligible lines with non-negative allocation bases `b[i]`:

1. Reject an empty line set, a negative base, or `sum(b) = 0`.
2. Compute the exact share `x[i] = T × b[i] / sum(b)` using decimal/integer arithmetic, never binary floating-point rounding.
3. Assign `floor(x[i])` minor units to every line.
4. Let `R = T - sum(floor(x[i]))`.
5. Give one remaining minor unit to the `R` lines with the largest fractional remainders. Break ties using a stable key such as line ID, never array arrival order.
6. Persist the total, basis type, basis value per line, allocated amount per line, currency exponent, algorithm version, actor, event time, and command/idempotency ID.
7. Assert exactly: `sum(allocated) = T`. A mismatch blocks confirmation.

Negative totals use the same algorithm over absolute values and then restore the sign. Do not mix positive and negative eligible lines in one allocation.

### Landed-cost bases

The user must choose or confirm the basis; AI must not guess it.

| Cost | Default eligible basis | Required exception handling |
|---|---|---|
| General freight/clearing with no better measurement | Purchase-line value | User can select weight or quantity when that better represents how the cost was incurred. |
| Per-unit handling | Quantity in base units | Unit conversions must be resolved before allocation. |
| Weight-based haulage | Weight | Every eligible product requires a confirmed weight; missing weight blocks allocation. |
| Cost belonging to one product/line | Direct assignment | Do not spread a directly attributable amount across unrelated items. |
| Recoverable tax, owner drawing, finance charge, abnormal waste | Not inventory landed cost by default | Route to the appropriate tax/expense/equity policy after accountant review. |

After confirmation, the allocated line cost becomes part of the purchase receipt’s immutable cost evidence and feeds the established moving weighted average. Backdated or reversed receipts require an explicit reversal/reposting policy; AI cannot rewrite old sale-cost snapshots.

## Sale, split tender, credit, and refund rules

- Payment rows must sum exactly to the sale total. For “paid 5,000 cash, rest on credit,” deterministic code calculates `credit = sale total - 5,000`; the model may only extract the spoken 5,000 and intended method.
- The credit remainder cannot be negative. An over-tendered cash amount is represented by `tenderedAmount`; it does not increase the `cash.amount` allocated to the sale.
- Change due is `cash tendered - cash sale allocation` only when the workflow makes the relevant cash allocation unambiguous. It is not revenue, credit, or a negative payment.
- Transfer/POS notes are audit metadata, not proof that funds settled. Future verification must create a separate provider/reconciliation event rather than mutate the original sale.
- Customer repayments are append-only credit-ledger movements and are never counted as sales. Partial and overpayments need an explicit balance-direction contract.
- Do not automatically prorate a general repayment across invoices until the product adopts an invoice-allocation policy. FIFO-oldest, merchant-selected, and unallocated-on-account are different accounting behaviours; AI must ask or leave the payment unallocated under the chosen policy.
- Refunds and voids remain online-only. A refund must reference the original sale and explicitly record its refund payment allocation. AI may prepare a draft but cannot choose the return destination, infer that a transfer succeeded, or execute the refund.

## Future provider integration boundary

If payment processing or bank-transfer verification is promoted into scope:

1. Reconcile the commercial contract and locked PCI decision before code.
2. Select a currently CBN-licensed provider and verify its current licence category, API terms, settlement model, dispute flow, webhooks, data location, retention, pricing, and outage behaviour from primary sources.
3. Use a provider-hosted payment element or dedicated terminal/reader path. No custom raw-card form, PAN, expiry, CVV, PIN, or track data may touch this client, backend, logs, analytics, drafts, or AI prompts.
4. Treat provider webhooks as untrusted: verify signatures, enforce replay/idempotency protection, persist the raw-event digest rather than secrets, and reconcile asynchronously.
5. Keep `sale total`, `customer tender`, `provider fee`, `provider net settlement`, `refund`, and `chargeback` as separate attributable amounts. Provider fees never silently reduce recorded sales.
6. A provider outage must not block tag-only cash/credit POS operation. “Pending verification” must remain visibly distinct from “paid/settled.”

## AI-specific safety gates

- Payment and proration outputs are always editable drafts outside financial ledgers.
- The confirmation view must show source values, computed values, allocation basis, rounding residue distribution, total checks, and uncertainty.
- Models cannot perform arithmetic used as financial truth. Deterministic code recomputes every total and remainder.
- A low-confidence product, contact, unit, payment direction, or allocation basis blocks one-tap confirmation.
- Audio/image/payment-provider data must follow an explicit purpose, minimisation, retention, deletion, and consent policy. Do not send full provider payloads, card data, or unnecessary contact data to a model.
- Evaluation fixtures must include split tenders, cash change, partial/overpayments, refunds, zero/negative bases, one-kobo residues, unit conversions, backdated receipts, duplicate retries, and offline-to-online replay.

## Repository findings and required work

| Area | Current evidence | Required before AI/payment expansion |
|---|---|---|
| Sale tender integrity | `complete-sale.ts` and database RPCs require payment sums to match the sale total | Preserve and share the validator across manual and future draft confirmation paths. |
| Cash tender/change | `SalePayment.tenderedAmount` is separate metadata with tests | Extend split-cash UX only with an unambiguous allocation contract. |
| Split payments | Existing POS hook and tests support multiple method tags | Add integer-minor-unit boundary before claiming exact proration safety. |
| Credit ledger | Append-only credit movements and partial repayment paths exist | Define debt direction, overpayment, and optional invoice-allocation policy. |
| Refunds | Online backend refund path exists | Prove refund allocations, authorization, idempotency, and reversal evidence end to end. |
| Landed cost | Roadmap proposes deterministic pro-rata math | Add a versioned allocation contract, eligible-cost policy, purchase-line allocation records, and property tests before implementation. |
| Provider processing | Explicitly out of current scope | Requires owner scope decision, legal/security review, licensed-provider research, and a separate architecture record. |

## Definition of done for this layer

The payment/proration layer is not ready merely because a calculation renders correctly. Completion requires property tests proving cent-level conservation and stable rounding, two-device idempotency/convergence tests for ledger-affecting commands, authorization tests, audit reconstruction, offline replay, reversal tests, report parity, provider-failure tests when applicable, and accountant/legal review for policies engineering cannot decide.

