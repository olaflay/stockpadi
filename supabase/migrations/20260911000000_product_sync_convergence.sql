-- Forward-only product schema and sync contract convergence.
-- Existing rows remain valid: nullable catalog fields are backfilled only by
-- their defaults, and archive is a soft-delete flag rather than a destructive
-- delete. See .agents/rules/offline-sync-and-ledger.md.

alter table public.products
  add column if not exists low_stock_threshold integer,
  add column if not exists expiry_date date,
  add column if not exists archived boolean not null default false;

comment on column public.products.low_stock_threshold is
  'Per-product alert level. NULL means use the application default.';
comment on column public.products.expiry_date is
  'Optional ISO calendar date for products whose expiry tracking is enabled.';
comment on column public.products.archived is
  'Soft-delete flag. Archived products remain for historical sales and ledger integrity.';

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
  v_business_id uuid;
  v_authoritative_version integer;
begin
  select business_id into v_business_id from public.users where id = actor_id;
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

  -- Refuse to touch another tenant's product, or to attach this tenant's
  -- product to another tenant's category/brand.
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
      v_id, v_business_id, payload->>'sku', nullif(payload->>'barcode', ''), payload->>'name',
      nullif(payload->>'categoryId', '')::uuid, nullif(payload->>'brandId', '')::uuid,
      coalesce(nullif(payload->>'unitLabel', ''), 'piece'), nullif(payload->>'altUnitLabel', ''),
      nullif(payload->>'altUnitConversionFactor', '')::numeric,
      nullif(payload->>'altUnitSellPrice', '')::numeric,
      (payload->>'costPrice')::numeric, (payload->>'sellPrice')::numeric,
      (payload->>'expiryTracking')::expiry_tracking_mode,
      nullif(payload->>'expiryDate', '')::date,
      nullif(payload->>'lowStockThreshold', '')::integer,
      coalesce((payload->>'archived')::boolean, false), 1
    )
    returning version into v_authoritative_version;
    return jsonb_build_object('status', 'applied', 'id', v_id, 'conflict', false, 'version', v_authoritative_version);
  end if;

  -- Optimistic concurrency is a guard, not an advisory warning. Never apply
  -- a stale snapshot over a newer remote product.
  if v_expected_version <> v_current_version then
    return jsonb_build_object(
      'status', 'conflict', 'id', v_id, 'conflict', true,
      'expectedVersion', v_expected_version, 'currentVersion', v_current_version
    );
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
    archived = coalesce((payload->>'archived')::boolean, false)
  where id = v_id and business_id = v_business_id
  returning version into v_authoritative_version;

  return jsonb_build_object('status', 'applied', 'id', v_id, 'conflict', false, 'version', v_authoritative_version);
end;
$$;

revoke execute on function public.sync_apply_product(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.sync_apply_product(jsonb, uuid) to service_role;
