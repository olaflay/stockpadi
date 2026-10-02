# POS (Point of Sale)

Checkout flow: barcode/search, split-tender payment-method tag, order/line discounts, hold/resume of parked sales, void (online only), and refund (online only).

### Features

- **Discounts:** Supports both order-level and line-level discounts. The discount is validated locally and enforced by server-side money integrity guards (`total = subtotal - discount`).
- **Hold / Resume (Parked Sales):** Cashiers can park an in-progress cart with items and discounts to serve the next customer in queue, and resume or discard held carts at any time.
- **Split Tender:** Full split-payment support across cash, bank transfer, POS card tag, and credit (customer owing).
- **Voids & Refunds (Online Only):** A void cancels a sale before settlement and marks payment legs as voided; a refund records stock returns via append-only ledger movements, credits customer debt, and tracks cash/transfer outflows. Per `.agents/rules/payment-and-pci-scope.md` and locked decision #4 in `AGENTS.md`, both operations strictly require an active internet connection.

Writes to the local outbox (see `src/features/sync`) immediately on every offline sale action; never blocks on network.
