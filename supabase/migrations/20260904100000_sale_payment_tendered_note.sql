-- Sale payment register metadata: tendered_amount + note.
--
-- Why: SUSTAINABILITY-AND-EXPERIENCE-BLUEPRINT §9.1 has the cashier's register
-- match the drawer — the sale_payments.amount stays the exact sale-total
-- portion, while tendered_amount records the physical cash the customer
-- actually handed over so the receipt can print `Tendered: ₦5,000 | Change:
-- ₦1,300`. §9.3 records bank-transfer audit metadata (provider + sender name /
-- session ID) the same way, printed on the receipt for the owner's end-of-day
-- cross-check with the bank app.
--
-- Both fields are optional audit metadata; neither changes the ledger or
-- balance arithmetic. sync_apply_sale is re-created (from the latest
-- tenant-ownership version, 20260823000000) so the server persists the
-- incoming payload's tenderedAmount/note instead of silently dropping them.
--
-- See .agents/rules/offline-sync-and-ledger.md and .agents/rules/database-and-rls.md.

alter table public.sale_payments
  add column tendered_amount numeric(14, 2),
  add column note text;

comment on column public.sale_payments.tendered_amount is
  'Physical cash handed over for this cash payment, when it differs from amount. '
  'amount stays the exact sale-total portion; the receipt prints Tendered/Change '
  'from this so the register matches the drawer. Blueprint §9.1.';
comment on column public.sale_payments.note is
  'Bank transfer audit metadata: provider plus sender name / session reference, '
  'printed on the receipt for end-of-day cross-check with the bank app. Blueprint §9.3.';

-- ---------------------------------------------------------------------------
-- sync_apply_sale: validate branch, customer, and every product
-- Re-created unchanged from 20260823000000 except the payments insert now
-- maps tenderedAmount -> tendered_amount and note -> note.
-- ---------------------------------------------------------------------------
create or replace function sync_apply_sale(payload jsonb, actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id uuid := (payload->>'id')::uuid;
  v_client_id uuid := (payload->>'clientId')::uuid;
  v_branch_id uuid := (payload->>'branchId')::uuid;
  v_customer_id uuid := nullif(payload->>'customerId', '')::uuid;
  v_created_at_local timestamptz := (payload->>'createdAtLocal')::timestamptz;
  v_existing_id uuid;
  v_item jsonb;
  v_payment jsonb;
  v_credit_amount numeric := 0;
  v_business_id uuid;
begin
  select business_id into v_business_id from users where id = actor_id;

  -- Tenant-ownership: the branch and any customer must belong to the actor.
  perform public.tenant_owns_entity(v_business_id, 'branches', v_branch_id);
  perform public.tenant_owns_entity(v_business_id, 'customers', v_customer_id);

  select id into v_existing_id from sales where client_id = v_client_id;
  if v_existing_id is not null then
    return jsonb_build_object('status', 'skipped', 'reason', 'already_applied', 'id', v_existing_id);
  end if;

  -- Tenant-ownership: every product line must belong to the actor. A sale can
  -- never touch another tenant's product (which would also decrement their
  -- stock via the shared rollup).
  for v_item in select * from jsonb_array_elements(payload->'items')
  loop
    perform public.tenant_owns_entity(v_business_id, 'products', (v_item->>'productId')::uuid);
  end loop;

  insert into sales (
    id, client_id, business_id, branch_id, customer_id,
    subtotal, discount, total, created_at_local, created_by_user_id
  ) values (
    v_sale_id, v_client_id, v_business_id, v_branch_id, v_customer_id,
    (payload->>'subtotal')::numeric, (payload->>'discount')::numeric, (payload->>'total')::numeric,
    v_created_at_local, actor_id
  );

  for v_payment in select * from jsonb_array_elements(payload->'payments')
  loop
    insert into sale_payments (sale_id, method, amount, tendered_amount, note)
    values (
      v_sale_id, (v_payment->>'method')::payment_method, (v_payment->>'amount')::numeric,
      nullif(v_payment->>'tenderedAmount', '')::numeric,
      nullif(v_payment->>'note', '')
    );

    if v_payment->>'method' = 'credit' then
      v_credit_amount := v_credit_amount + (v_payment->>'amount')::numeric;
    end if;
  end loop;

  if v_credit_amount > 0 and v_customer_id is not null then
    insert into customer_credit_movements (
      id, client_id, business_id, customer_id, amount_delta, source_reference_id,
      created_at_local, created_by_user_id
    ) values (
      gen_random_uuid(), v_client_id, v_business_id, v_customer_id, v_credit_amount, v_sale_id,
      v_created_at_local, actor_id
    );
  end if;

  for v_item in select * from jsonb_array_elements(payload->'items')
  loop
    insert into sale_items (sale_id, product_id, quantity, unit_price, discount, unit_label, unit_conversion_factor)
    values (
      v_sale_id, (v_item->>'productId')::uuid, (v_item->>'quantity')::integer,
      (v_item->>'unitPrice')::numeric, coalesce((v_item->>'discount')::numeric, 0),
      coalesce(nullif(v_item->>'unitLabel', ''), 'piece'), coalesce((v_item->>'conversionFactor')::numeric, 1)
    );

    -- Stock always moves in the product's base unit (products.unit_label),
    -- regardless of which unit was sold — one stock pool underneath. See
    -- finding 1.1-D in docs/RESEARCH-AND-PLAN.md.
    insert into stock_movements (
      id, client_id, business_id, branch_id, product_id, quantity_delta, source,
      source_reference_id, created_at_local, created_by_user_id
    ) values (
      gen_random_uuid(), (v_item->>'movementClientId')::uuid, v_business_id, v_branch_id,
      (v_item->>'productId')::uuid,
      -round((v_item->>'quantity')::numeric * coalesce((v_item->>'conversionFactor')::numeric, 1))::integer,
      'sale', v_sale_id, v_created_at_local, actor_id
    );
  end loop;

  return jsonb_build_object('status', 'applied', 'id', v_sale_id);
end;
$$;