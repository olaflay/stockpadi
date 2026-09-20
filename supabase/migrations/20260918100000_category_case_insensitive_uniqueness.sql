-- Categories are a tenant-scoped canonical name. This prevents two devices
-- from creating "Drinks" and "drinks" concurrently and leaving products
-- attached to duplicate category rows.

with ranked as (
  select id,
         first_value(id) over (
           partition by business_id, lower(btrim(name))
           order by id
         ) as canonical_id,
         row_number() over (
           partition by business_id, lower(btrim(name))
           order by id
         ) as duplicate_rank
  from public.categories
)
update public.products p
set category_id = ranked.canonical_id
from ranked
where p.category_id = ranked.id
  and ranked.duplicate_rank > 1;

with ranked as (
  select id,
         row_number() over (
           partition by business_id, lower(btrim(name))
           order by id
         ) as duplicate_rank
  from public.categories
)
delete from public.categories c
using ranked
where c.id = ranked.id
  and ranked.duplicate_rank > 1;

create unique index if not exists categories_business_normalized_name_uidx
  on public.categories (business_id, lower(btrim(name)));

create or replace function public.sync_apply_category(payload jsonb, actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_business_id uuid;
  v_id uuid := nullif(payload->>'id', '')::uuid;
  v_name text := nullif(btrim(payload->>'name'), '');
  v_existing_id uuid;
  v_existing_business uuid;
begin
  select business_id into v_business_id from public.users where id = actor_id;
  if v_business_id is null or v_id is null or v_name is null then
    raise exception using errcode = '22023', message = 'Category identity and name are required';
  end if;
  select business_id into v_existing_business from public.categories where id = v_id;
  if v_existing_business is not null and v_existing_business <> v_business_id then
    raise exception using errcode = '42501', message = 'Category belongs to another business';
  end if;
  select id into v_existing_id
  from public.categories
  where business_id = v_business_id and lower(btrim(name)) = lower(v_name)
  order by id limit 1;
  if v_existing_id is not null and v_existing_id <> v_id then
    return jsonb_build_object('status', 'skipped', 'id', v_existing_id, 'duplicate', true);
  end if;
  if v_existing_business is not null then
    update public.categories set name = v_name where id = v_id and business_id = v_business_id;
    return jsonb_build_object('status', 'applied', 'id', v_id);
  end if;
  insert into public.categories (id, business_id, name)
  values (v_id, v_business_id, v_name)
  on conflict do nothing;
  select id into v_existing_id from public.categories
  where business_id = v_business_id and lower(btrim(name)) = lower(v_name)
  order by id limit 1;
  if v_existing_id <> v_id then
    return jsonb_build_object('status', 'skipped', 'id', v_existing_id, 'duplicate', true);
  end if;
  return jsonb_build_object('status', 'applied', 'id', v_id);
end;
$function$;

revoke all on function public.sync_apply_category(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.sync_apply_category(jsonb, uuid) to service_role;
