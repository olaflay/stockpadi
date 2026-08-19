# Payment Handling and PCI Scope

## The rule

The app records payment method as a tag: cash, transfer, POS terminal, or credit. It never accepts, processes, stores, transmits, or displays a live card number, card expiry, CVV, or any other cardholder data. There is no code path anywhere in this application that touches raw payment card data. This is true in MVP and stays true until a deliberate, separate decision changes it.

## Why this is a rule and not just a scope note in the PRD

The moment a feature request sounds like "let's also let customers pay by card in the till," the fastest implementation path for an AI coding agent is to add a card input field and pass the value to a payment provider's charge API directly from the app. That single shortcut pulls the entire application into PCI DSS scope, meaning the whole codebase, not just the payment screen, becomes subject to card-data-handling compliance requirements. Square and other real POS products spend significant engineering effort specifically to avoid this (tokenization, dedicated hardware readers that never expose raw card data to the host app). Avoiding that complexity was a deliberate MVP decision, not an oversight, and it is cheap to preserve and expensive to walk back once violated.

## What to do if asked to add real payment processing

This is a real future roadmap item, not something to refuse outright. If asked to build it: stop before writing payment code, name the PCI scope tradeoff explicitly, and confirm the approach before proceeding. The correct approach when the time comes is a hosted payment element or a dedicated card-reader SDK (the kind Flutterwave, Paystack, and Square all provide) where raw card data never reaches this application's own server or client code, it goes directly from the customer's card or the reader hardware to the payment provider. Building a custom card input form that the app itself handles is not an acceptable implementation path under any framing, including "just for testing" or "we'll add the compliance later."

## Subscription and hosting billing

There is no in-app billing or subscription table. This is a single-tenant deployment, hosting costs are billed to the client outside the application, per `.agents/rules/hosting-and-deployment.md`. Do not add a `subscriptions` table or a billing UI, that belongs to a different product shape (see `.agents/rules/database-and-rls.md` on why the multi-tenant SaaS pattern doesn't apply here).
