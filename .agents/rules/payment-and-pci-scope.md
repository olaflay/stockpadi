# Payment Handling and PCI Scope

## The rule

The app records payment method as a tag: cash, transfer, POS terminal, or credit. It never accepts, processes, stores, transmits, or displays a live card number, card expiry, CVV, or any other cardholder data. There is no code path anywhere in this application that touches raw payment card data. This is true in MVP and stays true until a deliberate, separate decision changes it.

## Why this is a rule and not just a scope note in the PRD

The moment a feature request sounds like "let's also let customers pay by card in the till," the fastest implementation path for an AI coding agent is to add a card input field and pass the value to a payment provider's charge API directly from the app. That single shortcut pulls the entire application into PCI DSS scope, meaning the whole codebase, not just the payment screen, becomes subject to card-data-handling compliance requirements. Square and other real POS products spend significant engineering effort specifically to avoid this (tokenization, dedicated hardware readers that never expose raw card data to the host app). Avoiding that complexity was a deliberate MVP decision, not an oversight, and it is cheap to preserve and expensive to walk back once violated.

## What to do if asked to add real payment processing

This is a real future roadmap item, not something to refuse outright. If asked to build it: stop before writing payment code, name the PCI scope tradeoff explicitly, and confirm the approach before proceeding. The correct approach when the time comes is a hosted payment element or a dedicated card-reader SDK (the kind Flutterwave, Paystack, and Square all provide) where raw card data never reaches this application's own server or client code, it goes directly from the customer's card or the reader hardware to the payment provider. Building a custom card input form that the app itself handles is not an acceptable implementation path under any framing, including "just for testing" or "we'll add the compliance later."

## Subscription and hosting billing

Subscription packaging and collection are separate from payment processing at the till. This is a multi-tenant shared-database product as defined by `.agents/rules/database-and-rls.md`; every entitlement must be enforced at the authenticated server/database boundary, never only by hiding frontend controls. Do not add a billing provider, subscription schema, or collection UI until the commercial contract in the canonical roadmap is explicitly reconciled. Regardless of how the product subscription is collected, the POS continues to record customer payment methods only as tags and never handles raw card data.
