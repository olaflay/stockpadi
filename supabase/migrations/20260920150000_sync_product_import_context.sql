-- Product imports and their opening-stock mutations must use the same
-- membership-derived tenant context as the Node account-context endpoint.
-- The legacy users.business_id column remains for compatibility, but it is not
-- the authoritative source when a membership exists.

create or replace function public.sync_actor_business_id(p_actor_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_membership_count integer;
  v_membership_business_id uuid;
begin
  select count(*)::integer, min(membership.business_id::text)::uuid
    into v_membership_count, v_membership_business_id
  from public.business_memberships membership
  where membership.user_id = p_actor_id
    and membership.status = 'active';

  if v_membership_count > 1 then
    raise exception using errcode = '42501', message = 'Ambiguous business context';
  end if;
  if v_membership_count = 1 then
    return v_membership_business_id;
  end if;
  return (select legacy.business_id from public.users legacy where legacy.id = p_actor_id);
end;
$$;

revoke execute on function public.sync_actor_business_id(uuid) from public, anon, authenticated;
grant execute on function public.sync_actor_business_id(uuid) to service_role;

-- Keep the complete canonical product snapshot and optimistic concurrency
-- semantics from the latest product-sync migration, changing only the tenant
-- context source to the canonical membership helper.
create or replace function public.sync_apply_product(payload jsonb, actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := (payload->>'id')::uuid;
  v_expected_version integer := (payload->>'version')::integer;
  v_current_version integer;
  v_business_id uuid := public.sync_actor_business_id(actor_id);
  v_authoritative_version integer;
begin
  if v_business_id is null then
    raise exception using errcode = '42501', message = 'Missing business context';
  end if;
  if v_id is null or v_expected_version is null
     or not (payload ? 'sku') or not (payload ? 'name')
     or not (payload ? 'categoryId') or not (payload ? 'brandId')
     or not (payload ? 'unitLabel') or not (payload ? 'costPrice')
     or not (payload ? 'sellPrice') or not (payload ? 'expiryTracking')
     or not (payload ? 'expiryDate') or not (payload ? 'lowStockThreshold') then
    raise exception using errcode = '22023', message = 'Product mutation must contain a complete canonical snapshot and expected version';
  end if;

  if exists (select 1 from public.products where id = v_id and business_id <> v_business_id) then
    raise exception using errcode = '42501', message = 'Product belongs to another business';
  end if;
  perform public.tenant_owns_entity(v_business_id, 'categories', nullif(payload->>'categoryId', '')::uuid);
  perform public.tenant_owns_entity(v_business_id, 'brands', nullif(payload->>'brandId', '')::uuid);

  select version into v_current_version from public.products where id = v_id;
  if v_current_version is null then
    insert into public.products (
      id, business_id, sku, barcode, name, category_id, brand_id, unit_label,
      alt_unit_label, alt_unit_conversion_factor, alt_unit_sell_price,
      cost_price, sell_price, expiry_tracking, expiry_date,
      low_stock_threshold, archived, version
    ) values (
      v_id, v_business_id, payload->>'sku', nullif(payload->>'barcode', ''),
      payload->>'name', nullif(payload->>'categoryId', '')::uuid,
      nullif(payload->>'brandId', '')::uuid,
      coalesce(nullif(payload->>'unitLabel', ''), 'piece'),
      nullif(payload->>'altUnitLabel', ''),
      nullif(payload->>'altUnitConversionFactor', '')::numeric,
      nullif(payload->>'altUnitSellPrice', '')::numeric,
      (payload->>'costPrice')::numeric, (payload->>'sellPrice')::numeric,
      (payload->>'expiryTracking')::expiry_tracking_mode,
      nullif(payload->>'expiryDate', '')::date,
      nullif(payload->>'lowStockThreshold', '')::integer,
      coalesce((payload->>'archived')::boolean, false), 1
    ) returning version into v_authoritative_version;
    return jsonb_build_object('status', 'applied', 'id', v_id, 'conflict', false, 'version', v_authoritative_version);
  end if;

  if v_expected_version <> v_current_version then
    return jsonb_build_object('status', 'conflict', 'id', v_id, 'conflict', true, 'expectedVersion', v_expected_version, 'currentVersion', v_current_version);
  end if;

  update public.products set
    sku = payload->>'sku',
    barcode = nullif(payload->>'barcode', ''),
    name = payload->>'name',
    category_id = nullif(payload->>'categoryId', '')::uuid,
    brand_id = nullif(payload->>'brandId', '')::uuid,
    unit_label = coalesce(nullif(payload->>'unitLabel', ''), 'piece'),
    alt_unit_label = nullif(payload->>'altUnitLabel', ''),
    alt_unit_conversion_factor = nullif(payload->>'altUnitConversionFactor', '')::numeric,
    alt_unit_sell_price = nullif(payload->>'altUnitSellPrice', '')::numeric,
    cost_price = (payload->>'costPrice')::numeric,
    sell_price = (payload->>'sellPrice')::numeric,
    expiry_tracking = (payload->>'expiryTracking')::expiry_tracking_mode,
    expiry_date = nullif(payload->>'expiryDate', '')::date,
    low_stock_threshold = nullif(payload->>'lowStockThreshold', '')::integer,
    archived = coalesce((payload->>'archived')::boolean, false),
    version = version + 1,
    updated_at = now()
  where id = v_id and business_id = v_business_id
  returning version into v_authoritative_version;

  return jsonb_build_object('status', 'applied', 'id', v_id, 'conflict', false, 'version', v_authoritative_version);
end;
$$;

revoke execute on function public.sync_apply_product(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.sync_apply_product(jsonb, uuid) to service_role;

-- Opening stock from the importer uses the same stock-adjustment event path as
-- manual opening stock. Keep the append-only/idempotent behavior and use the
-- canonical tenant context here too.
create or replace function public.sync_apply_stock_adjustment(payload jsonb, actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adjustment_id uuid := (payload->>'id')::uuid;
  v_client_id uuid := (payload->>'clientId')::uuid;
  v_branch_id uuid := (payload->>'branchId')::uuid;
  v_product_id uuid := (payload->>'productId')::uuid;
  v_quantity_delta integer := (payload->>'quantityDelta')::integer;
  v_existing_id uuid;
  v_movement_id uuid;
  v_business_id uuid := public.sync_actor_business_id(actor_id);
begin
  if v_business_id is null then
    raise exception using errcode = '42501', message = 'Missing business context';
  end if;
  perform public.tenant_owns_entity(v_business_id, 'branches', v_branch_id);
  perform public.tenant_owns_entity(v_business_id, 'products', v_product_id);

  select id into v_existing_id from public.stock_adjustments where client_id = v_client_id;
  if v_existing_id is not null then
    return jsonb_build_object('status', 'skipped', 'reason', 'already_applied', 'id', v_existing_id);
  end if;

  v_movement_id := gen_random_uuid();
  insert into public.stock_movements (
    id, client_id, business_id, branch_id, product_id, quantity_delta, source,
    source_reference_id, reason_code, created_at_local, created_by_user_id
  ) values (
    v_movement_id, v_client_id, v_business_id, v_branch_id, v_product_id,
    v_quantity_delta, 'adjustment', v_adjustment_id,
    payload->>'reasonCode', (payload->>'createdAtLocal')::timestamptz, actor_id
  );

  insert into public.stock_adjustments (
    id, client_id, business_id, branch_id, product_id, quantity_delta,
    reason_code, note, stock_movement_id, created_by_user_id
  ) values (
    v_adjustment_id, v_client_id, v_business_id, v_branch_id, v_product_id,
    v_quantity_delta, payload->>'reasonCode', payload->>'note',
    v_movement_id, actor_id
  );

  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, after_state)
  values (v_business_id, actor_id, 'stock_adjustment', 'stock_adjustments', v_adjustment_id, payload);

  return jsonb_build_object('status', 'applied', 'id', v_adjustment_id);
end;
$$;

revoke execute on function public.sync_apply_stock_adjustment(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.sync_apply_stock_adjustment(jsonb, uuid) to service_role;
