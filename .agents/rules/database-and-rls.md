# Database Shape and Row Level Security

## The rule

This is a multi-tenant shared database architecture. Every core table MUST include a `business_id` column to strictly associate data with a specific client/tenant. Multi-tenancy is handled securely via PostgreSQL Row Level Security (RLS). Under no circumstances should application logic query data without RLS enforcing the `business_id` boundary. This allows for infinite horizontal scaling of new clients onto the same infrastructure without provisioning new databases.

This means Row Level Security serves two distinct and equally critical purposes in this codebase:
1. **Tenant Isolation**: RLS ensures that one client can never see or modify the data of another client querying the same shared database.
2. **Role-based Access**: Within a single tenant, RLS enforces the permission matrix below. A Cashier cannot query another branch's cost prices, and an Inventory Staff account cannot see sales totals.

## Permission matrix (enforce via RLS policy, not just UI hiding)

| Action | Owner | Manager | Cashier | Inventory Staff | Accountant | Admin |
|---|---|---|---|---|---|---|
| View sales | Yes | Yes | Own only | No | Yes | Yes |
| Process sale | Yes | Yes | Yes | No | No | Yes |
| Void/refund sale | Yes | Yes | No | No | No | Yes |
| Add/edit products | Yes | Yes | No | Yes | No | Yes |
| Stock adjustments | Yes | Yes | No | Yes | No | Yes |
| View reports | Yes | Yes | No | Limited | Yes | Yes |
| Manage expenses | Yes | Limited | No | No | Yes | Yes |
| Manage staff/roles | Yes | No | No | No | No | Yes |
| Change settings | Yes | No | No | No | No | Yes |
| View audit log | Yes | Limited | No | No | No | Yes |

A UI element being hidden from a role is not a security control. Every row above must be enforced by an actual RLS policy on the underlying table, checked with a test that logs in as that role and confirms the denial, not just confirms the button is absent from the screen.

## Branch scoping

A Cashier or Inventory Staff account is scoped to the branch or branches they are assigned to via the `users`-to-`branches` relationship. Owner, Manager, Accountant, and Admin roles see across all branches by default, with the consolidated dashboard reading across branches for those roles specifically.

## Migration discipline

Every schema change ships as a versioned migration, never a manual edit against the running database. Migrations get applied identically in local development and against the Supabase Cloud project via the deployment process in `.agents/rules/hosting-and-deployment.md`. Do not hand-edit the schema on the production Supabase Cloud project to fix something quickly, write the migration, even under time pressure, because the alternative is a schema that has silently drifted from what's in version control.

## Audit logging

Every void, stock adjustment, role change, and PIN reset writes a row to `audit_logs` with the actor, timestamp, and before/after state. This is not optional instrumentation, it is how a disputed number gets explained to the client after the fact.
