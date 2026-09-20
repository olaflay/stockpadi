-- Complete the client-generated branch/category lifecycle and make product
-- optimistic concurrency advance on every successful update.

insert into public.worker_permissions (user_id, business_id, permission, enabled)
select m.user_id, m.business_id, permissions.permission, true
from public.business_memberships m
cross join (values
  ('RECEIVE_STOCK'), ('RECORD_REPAYMENT'), ('CREATE_CUSTOMERS'), ('VIEW_BRANCH_RECONCILIATION')
) as permissions(permission)
where m.account_type = 'WORKER'
on conflict (user_id, business_id, permission) do nothing;

create or replace function public.sync_apply_category(payload jsonb, actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_id uuid := (payload->>'id')::uuid;
  v_name text := btrim(payload->>'name');
  v_existing_business uuid;
  v_existing_id uuid;
begin
  select business_id into v_business_id from public.users where id = actor_id;
  if v_business_id is null then raise exception using errcode = '42501', message = 'Missing business context'; end if;
  if v_id is null or v_name is null or v_name = '' then raise exception using errcode = '22023', message = 'Category id and name are required'; end if;

  select business_id into v_existing_business from public.categories where id = v_id;
  if v_existing_business is not null and v_existing_business <> v_business_id then
    raise exception using errcode = '42501', message = 'Category belongs to another business';
  end if;

  select id into v_existing_id from public.categories where business_id = v_business_id and lower(name) = lower(v_name) order by id limit 1;
  if v_existing_id is not null and v_existing_id <> v_id then
    return jsonb_build_object('status', 'skipped', 'id', v_existing_id, 'duplicate', true);
  end if;

  insert into public.categories (id, business_id, name) values (v_id, v_business_id, v_name)
  on conflict (id) do update set name = excluded.name;
  return jsonb_build_object('status', 'applied', 'id', v_id);
end;
$$;

create or replace function public.sync_apply_branch(payload jsonb, actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_id uuid := (payload->>'id')::uuid;
  v_name text := btrim(payload->>'name');
  v_is_active boolean := coalesce((payload->>'isActive')::boolean, true);
  v_existing_business uuid;
  v_count integer;
begin
  select business_id into v_business_id from public.users where id = actor_id;
  if v_business_id is null then raise exception using errcode = '42501', message = 'Missing business context'; end if;
  if v_id is null or v_name is null or v_name = '' then raise exception using errcode = '22023', message = 'Branch id and name are required'; end if;
  select business_id into v_existing_business from public.branches where id = v_id;
  if v_existing_business is not null and v_existing_business <> v_business_id then
    raise exception using errcode = '42501', message = 'Branch belongs to another business';
  end if;
  if v_existing_business is null then
    select count(*) into v_count from public.branches where business_id = v_business_id;
    if v_count >= 6 then raise exception using errcode = '23505', message = 'Branch limit reached'; end if;
    insert into public.branches (id, business_id, name, is_active) values (v_id, v_business_id, v_name, v_is_active);
  else
    update public.branches set name = v_name, is_active = v_is_active, updated_at = now() where id = v_id and business_id = v_business_id;
  end if;
  return jsonb_build_object('status', 'applied', 'id', v_id);
end;
$$;

revoke all on function public.sync_apply_category(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.sync_apply_category(jsonb, uuid) to service_role;
revoke all on function public.sync_apply_branch(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.sync_apply_branch(jsonb, uuid) to service_role;

-- Re-declare the canonical product function so a successful update advances
-- the authoritative version. Historical migrations remain untouched.
create or replace function public.sync_apply_product(payload jsonb, actor_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := (payload->>'id')::uuid;
  v_expected_version integer := (payload->>'version')::integer;
  v_current_version integer;
  v_business_id uuid;
  v_authoritative_version integer;
begin
  select business_id into v_business_id from public.users where id = actor_id;
  if v_business_id is null then raise exception using errcode = '42501', message = 'Missing business context'; end if;
  if v_id is null or v_expected_version is null or not (payload ? 'sku') or not (payload ? 'name') or not (payload ? 'categoryId') or not (payload ? 'brandId') or not (payload ? 'unitLabel') or not (payload ? 'costPrice') or not (payload ? 'sellPrice') or not (payload ? 'expiryTracking') or not (payload ? 'expiryDate') or not (payload ? 'lowStockThreshold') then
    raise exception using errcode = '22023', message = 'Product mutation must contain a complete canonical snapshot and expected version';
  end if;
  if exists (select 1 from public.products where id = v_id and business_id <> v_business_id) then raise exception using errcode = '42501', message = 'Product belongs to another business'; end if;
  perform public.tenant_owns_entity(v_business_id, 'categories', nullif(payload->>'categoryId', '')::uuid);
  perform public.tenant_owns_entity(v_business_id, 'brands', nullif(payload->>'brandId', '')::uuid);
  select version into v_current_version from public.products where id = v_id;
  if v_current_version is null then
    insert into public.products (id, business_id, sku, barcode, name, category_id, brand_id, unit_label, alt_unit_label, alt_unit_conversion_factor, alt_unit_sell_price, cost_price, sell_price, expiry_tracking, expiry_date, low_stock_threshold, archived, version)
    values (v_id, v_business_id, payload->>'sku', nullif(payload->>'barcode', ''), payload->>'name', nullif(payload->>'categoryId', '')::uuid, nullif(payload->>'brandId', '')::uuid, coalesce(nullif(payload->>'unitLabel', ''), 'piece'), nullif(payload->>'altUnitLabel', ''), nullif(payload->>'altUnitConversionFactor', '')::numeric, nullif(payload->>'altUnitSellPrice', '')::numeric, (payload->>'costPrice')::numeric, (payload->>'sellPrice')::numeric, (payload->>'expiryTracking')::expiry_tracking_mode, nullif(payload->>'expiryDate', '')::date, nullif(payload->>'lowStockThreshold', '')::integer, coalesce((payload->>'archived')::boolean, false), 1)
    returning version into v_authoritative_version;
    return jsonb_build_object('status', 'applied', 'id', v_id, 'conflict', false, 'version', v_authoritative_version);
  end if;
  if v_expected_version <> v_current_version then
    return jsonb_build_object('status', 'conflict', 'id', v_id, 'conflict', true, 'expectedVersion', v_expected_version, 'currentVersion', v_current_version);
  end if;
  update public.products set sku = payload->>'sku', barcode = nullif(payload->>'barcode', ''), name = payload->>'name', category_id = nullif(payload->>'categoryId', '')::uuid, brand_id = nullif(payload->>'brandId', '')::uuid, unit_label = coalesce(nullif(payload->>'unitLabel', ''), 'piece'), alt_unit_label = nullif(payload->>'altUnitLabel', ''), alt_unit_conversion_factor = nullif(payload->>'altUnitConversionFactor', '')::numeric, alt_unit_sell_price = nullif(payload->>'altUnitSellPrice', '')::numeric, cost_price = (payload->>'costPrice')::numeric, sell_price = (payload->>'sellPrice')::numeric, expiry_tracking = (payload->>'expiryTracking')::expiry_tracking_mode, expiry_date = nullif(payload->>'expiryDate', '')::date, low_stock_threshold = nullif(payload->>'lowStockThreshold', '')::integer, archived = coalesce((payload->>'archived')::boolean, false), version = version + 1, updated_at = now() where id = v_id and business_id = v_business_id returning version into v_authoritative_version;
  return jsonb_build_object('status', 'applied', 'id', v_id, 'conflict', false, 'version', v_authoritative_version);
end;
$$;

revoke execute on function public.sync_apply_product(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.sync_apply_product(jsonb, uuid) to service_role;
