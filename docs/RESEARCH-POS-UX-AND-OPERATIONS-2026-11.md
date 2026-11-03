# POS UX and operations research — November 2026

## Decision summary

The strongest current market signal is not for more disconnected modules. Small retailers need a
short, dependable path between selling, receiving stock, recording expenses, collecting debt, and
understanding whether their records are safely saved. OjàPadi should therefore improve the
connections and explanations around capabilities it already supports before expanding scope.

This research does not override `docs/LAUNCH_SCOPE.md`, the append-only ledger, offline rules, or
the TRUST gate. Items outside the frozen boundary remain experiments or roadmap work.

## Evidence reviewed

Firecrawl searches were run on 2026-11-03 with a one-year recency filter where supported. The
review covered Nigerian POS guidance, official competitor documentation, recent user complaints,
and inventory workflow guidance. Search results were saved locally under `.firecrawl/`, which is
gitignored because research captures can be regenerated.

Primary and market sources:

- [Odoo 19 point-of-sale workflow](https://www.odoo.com/documentation/19.0/applications/sales/point_of_sale/use.html)
- [Odoo inventory adjustments](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/warehouses_storage/inventory_management/count_products.html)
- [Shopify retail inventory management](https://www.shopify.com/blog/retail-inventory-management)
- [Shopify POS and ecommerce integration](https://www.shopify.com/blog/pos-ecommerce-integration)
- [Shopify POS inventory adjustments](https://help.shopify.com/en/manual/sell-in-person/shopify-pos/inventory-management/changing-inventory-quantities-pos)
- [Loyverse offline POS limitations](https://help.loyverse.com/help/offline-work-of-pos)
- [MyTreda Nigerian inventory software guide](https://mytreda.com/blog/best-inventory-management-software-nigeria)
- [CliqPOS Nigerian POS guide](https://cliqpos.com/best-pos-system-nigeria)

Recent complaint signals were used as qualitative evidence, not prevalence estimates:

- [Shopify inventory sync incident report](https://community.shopify.com/t/pos-wont-sync-product-and-inventory/615726)
- [Recent Shopify inventory sync complaint](https://www.reddit.com/r/InventoryManagement/comments/1u1bv87/why_does_my_shopify_inventory_keep_going_out_of/)
- [Recent Square and Shopify reconciliation complaint](https://www.reddit.com/r/SquarePOS_Users/comments/1vstn8u/anyone_else_using_square_and_shopify_setup_and/)
- [Bumpa user feedback](https://insights.ng/businesses/bumpa)

## Findings

1. Competitors are strongest when products, customers, orders, and inventory form one operational
   record rather than separate systems that need manual reconciliation.
2. Odoo and Shopify make stock counts reviewable: expected quantity, counted quantity, difference,
   actor, and confirmation are visible.
3. Odoo and Loyverse document offline limits. Their limitations show why an unclear offline state
   is dangerous even when selling still works.
4. Nigerian products consistently emphasize local reporting, transfer as a payment tag, expenses,
   customer debt, and usable offline behaviour.
5. Recent complaints centre on inventory drift, unclear sync state, excessive navigation, and help
   content that does not match the screen.

## OjàPadi fit and action

| Need | Existing support | Product action | Scope decision |
| --- | --- | --- | --- |
| Fast sale-to-stock connection | Sales create append-only stock movements | Keep stock effects visible in confirmations and history | Now |
| Expense versus delivery clarity | Expense outflow and `receivePurchase` are separate, tested paths | Present both from one entry surface while retaining distinct accounting behaviour | Implemented |
| Understandable stock count | Count confirmation records only the ledger delta | Preserve expected/count/difference review and actor evidence | Keep and harden |
| Debt collection | Debtor ledger, reminders, statement sharing | Use debt colour and language consistently; highlight the final amount owed | Implemented |
| Offline trust | Durable outbox, retry, alerts, and diagnostics | Add privacy-limited device/outbox health after its accepted gate | V1.1 |
| Low-stock and expiry attention | Threshold and expiry insight logic exists | Improve discovery before adding push notifications | Now; push is experiment |
| Receiving and suppliers | Supplier and purchase receipt records exist | Improve receipt confirmation and traceability; do not create a marketplace | Now |
| Fewer navigation hops | More and drawer expose many destinations | Keep frequent actions on More; group infrequent tools by job | Implemented incrementally |
| Purchase-order planning | Receiving exists, but reorder planning is outside frozen launch scope | Validate supplier reorder drafts with merchants first | Discovery |
| Automated messaging, OCR, and AI | Bounded manual sharing exists | Require consent, accuracy, cost, provenance, and human-confirmation gates | Experiment only |

## Build sequence

### 1. Reliability and clarity now

- Complete the cross-frontend input-focus audit and keep modal components mounted stably while
  users type.
- Standardize modal entrance motion while respecting reduced-motion preferences.
- Keep the scanning route escapable and provide a visible back action.
- Use one debt visual language: purple amount owed, no misleading positive-payment sign, and an
  explicit final outstanding balance on shared statements.
- Keep expense and stock delivery accessible together, but never let an expense mutate stock.
- Verify sale, delivery, stock count, and payment changes with ledger and convergence tests.

### 2. Owner control after the accepted gate

- Surface only app version, last successful sync, and oldest pending record age in device health.
- Provide a plain-language recovery action when a record needs attention.
- Add authenticated audit export only after authorization and tenant-isolation evidence passes.

### 3. Validate before expanding

- Interview pilot merchants about supplier reorder drafts, shifts, transfers, variants, and push
  notifications; measure frequency and operational cost.
- Treat OCR as a reviewed receiving draft, never an autonomous ledger write.
- Treat WhatsApp Business automation as opt-in only, with accepted cost, retention, and delivery
  failure behaviour.

## TRUST evidence

This direction serves TRUST 1 (reliable actions), 3 (explainable stock), 4 (historical money
integrity), 6 (honest offline state), 7 (recoverability), and 9 (understandable interface).
Completion evidence must remain executed tests, typecheck/lint, physical-device checks where
required, and ledger/convergence tests for every stock-affecting path. Research evidence alone is
not completion evidence.
