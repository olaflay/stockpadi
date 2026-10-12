-- Close authorization gaps found in the October 2026 permission review.
-- All changes are forward-only and preserve existing tenant/branch policies.

-- Account identity used by RLS must fail closed when the user profile has been
-- disabled, even if a separate membership lifecycle update did not complete.
create or replace function public.auth_account_type()
returns text
language sql stable security definer set search_path = public
as $$
  select case
    when exists (
      select 1
      from public.platform_admins pa
      where pa.user_id = auth.uid()
        and pa.status = 'active'
        and (
          not exists (select 1 from public.users u where u.id = auth.uid())
          or exists (select 1 from public.users u where u.id = auth.uid() and u.is_active = true)
        )
    ) then 'ADMIN'
    else (
      select bm.account_type
      from public.business_memberships bm
      join public.business_profile bp on bp.id = bm.business_id
      join public.users u on u.id = bm.user_id and u.is_active = true
      where bm.user_id = auth.uid()
        and bm.status = 'active'
        and bp.status = 'verified'
        and bp.is_active = true
      order by bm.created_at
      limit 1
    )
  end;
$$;

create or replace function public.auth_business_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select bm.business_id
  from public.business_memberships bm
  join public.business_profile bp on bp.id = bm.business_id
  join public.users u on u.id = bm.user_id and u.is_active = true
  where bm.user_id = auth.uid()
    and bm.status = 'active'
    and bp.status = 'verified'
    and bp.is_active = true
  order by bm.created_at
  limit 1;
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = auth.uid()
      and pa.status = 'active'
      and (
        not exists (select 1 from public.users u where u.id = auth.uid())
        or exists (select 1 from public.users u where u.id = auth.uid() and u.is_active = true)
      )
  );
$$;

-- Only owners and platform administrators may inspect other members' identity
-- and role metadata. A normal member may still see their own active membership.
drop policy if exists business_memberships_select on public.business_memberships;
create policy business_memberships_select on public.business_memberships
for select to authenticated using (
  (user_id = auth.uid() and public.auth_account_type() is not null)
  or (
    business_id = public.auth_business_id()
    and public.auth_account_type() = 'BUSINESS_OWNER'
  )
  or public.is_platform_admin()
);

drop policy if exists worker_permissions_select on public.worker_permissions;
create policy worker_permissions_select on public.worker_permissions
for select to authenticated using (
  (user_id = auth.uid() and business_id = public.auth_business_id())
  or (business_id = public.auth_business_id() and public.auth_account_type() = 'BUSINESS_OWNER')
  or public.is_platform_admin()
);

-- A direct reconciliation insert must carry the same capability enforced by
-- the Node API, in addition to its tenant, actor, and branch checks.
drop policy if exists reconciliation_insert on public.reconciliation_records;
create policy reconciliation_insert on public.reconciliation_records
for insert to authenticated
with check (
  business_id = public.auth_business_id()
  and actor_user_id = auth.uid()
  and exists (
    select 1 from public.branches b
    where b.id = public.reconciliation_records.branch_id
      and b.business_id = public.reconciliation_records.business_id
  )
  and (
    public.auth_account_type() = 'BUSINESS_OWNER'
    or (
      public.auth_account_type() = 'WORKER'
      and public.auth_worker_has_capability('SUBMIT_RECONCILIATION')
      and branch_id in (select public.auth_branch_ids())
    )
  )
);

-- Column-level privileges prevent direct PostgREST reads of current product
-- cost and historical sale-line cost. Backend owner reads use service_role
-- only after resolving an authorized account and explicitly filtering tenant.
revoke select on table public.products, public.sale_items from public, anon, authenticated;
revoke select (cost_price) on table public.products from public, anon, authenticated;
revoke select (unit_cost) on table public.sale_items from public, anon, authenticated;

do $column_grants$
declare
  v_product_columns text;
  v_sale_item_columns text;
begin
  select string_agg(format('%I', a.attname), ', ' order by a.attnum)
    into v_product_columns
  from pg_attribute a
  where a.attrelid = 'public.products'::regclass
    and a.attnum > 0 and not a.attisdropped and a.attname <> 'cost_price';

  select string_agg(format('%I', a.attname), ', ' order by a.attnum)
    into v_sale_item_columns
  from pg_attribute a
  where a.attrelid = 'public.sale_items'::regclass
    and a.attnum > 0 and not a.attisdropped and a.attname <> 'unit_cost';

  if v_product_columns is null or v_sale_item_columns is null then
    raise exception 'Unable to establish safe read columns for products and sale_items';
  end if;

  execute format('grant select (%s) on table public.products to authenticated', v_product_columns);
  execute format('grant select (%s) on table public.sale_items to authenticated', v_sale_item_columns);
end;
$column_grants$;

grant select on table public.products, public.sale_items to service_role;

-- Idempotent retries may return an existing row only to the tenant that owns
-- it. A globally colliding client id from another business is a generic
-- authorization failure and never returns the foreign row id.
do $idempotency_guards$
declare
  v_function regprocedure;
  v_definition text;
  v_rewritten text;
  v_old text := $old$    return jsonb_build_object('status', 'skipped', 'reason', 'already_applied', 'id', v_existing_id);$old$;
  v_target record;
begin
  for v_target in
    select * from (values
      ('sync_apply_sale', 'sales'),
      ('sync_apply_stock_adjustment', 'stock_adjustments'),
      ('sync_apply_purchase_receipt', 'purchases'),
      ('sync_apply_credit_payment', 'customer_credit_movements'),
      ('sync_apply_expense', 'expenses')
    ) as targets(function_name, table_name)
  loop
    v_function := to_regprocedure(format('public.%s(jsonb,uuid)', v_target.function_name));
    if v_function is null then
      raise exception 'Required idempotency function public.%s(jsonb,uuid) is missing', v_target.function_name;
    end if;

    v_definition := pg_get_functiondef(v_function);
    v_rewritten := replace(
      v_definition,
      v_old,
      format(
        '    if not exists (select 1 from public.%I where id = v_existing_id and business_id = v_business_id) then raise exception using errcode = ''42501'', message = ''Operation already exists outside this business''; end if;%s    return jsonb_build_object(''status'', ''skipped'', ''reason'', ''already_applied'', ''id'', v_existing_id);',
        v_target.table_name,
        E'\n'
      )
    );

    if length(v_definition) - length(replace(v_definition, v_old, '')) <> length(v_old) then
      raise exception 'Expected exactly one idempotency response in public.%', v_target.function_name;
    end if;
    execute v_rewritten;
  end loop;
end;
$idempotency_guards$;

-- Staff may supply a cost while creating a new product, but cannot overwrite
-- the existing cost on an update. Cost read access remains owner-only.
do $product_cost_guard$
declare
  v_function regprocedure := to_regprocedure('public.sync_apply_product(jsonb,uuid)');
  v_definition text;
  v_rewritten text;
  v_owner_check text := 'exists (select 1 from public.business_memberships bm join public.users u on u.id = bm.user_id and u.is_active = true where bm.user_id = actor_id and bm.business_id = v_business_id and bm.account_type = ''BUSINESS_OWNER'' and bm.status = ''active'')';
  v_old_update text := $old_update$    cost_price = (payload->>'costPrice')::numeric,$old_update$;
begin
  if v_function is null then
    raise exception 'Required product sync function public.sync_apply_product(jsonb,uuid) is missing';
  end if;
  v_definition := pg_get_functiondef(v_function);
  v_rewritten := replace(
    v_definition,
    v_old_update,
    format('    cost_price = case when %s then (payload->>''costPrice'')::numeric else cost_price end,', v_owner_check)
  );
  if v_rewritten = v_definition
    or length(v_definition) - length(replace(v_definition, v_old_update, '')) <> length(v_old_update) then
    raise exception 'Could not safely install the product cost authorization guard';
  end if;
  execute v_rewritten;
end;
$product_cost_guard$;
