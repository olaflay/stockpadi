# POS (Point of Sale)

Checkout flow: barcode/search, discount, payment-method tag, hold/resume, void (online only).

Writes to the local outbox (see `src/features/sync`) immediately on every action; never blocks on network. Void/refund UI must check connectivity and disable itself offline per `.agents/rules/payment-and-pci-scope.md` and the locked decision in `AGENTS.md` #4.
