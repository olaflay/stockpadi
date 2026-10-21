-- Category deletes were queuing a nameless payload ({ id, deleted: true,
-- isDeleted: true }), which sync_apply_category rejected with SQLSTATE 22023
-- ("Category identity and name are required"). The sync pipeline classifies
-- 22023 as a permanent VALIDATION_ERROR, so the outbox row never drained and
-- the owner saw a sync error on a screen where they had only deleted a
-- category.
--
-- Two changes:
--   1. The client now sends the category's real name alongside the delete
--      flag, so the server can authorise the delete.
--   2. This function honours the `deleted` flag: it removes the category and
--      unassigns it from any products, which is what the client already did
--      locally. Without this, a delete would be re-inserted as a category row
--      and would come back on the next pull.
--
-- The delete is tenant-scoped: a category belonging to another business still
-- raises 42501, and the FK from products.category_id is cleared first so the
-- hard delete cannot violate it.

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
  v_is_deleted boolean := coalesce((payload->>'deleted')::boolean, false);
  v_existing_id uuid;
  v_existing_business uuid;
  v_existing_name text;
begin
  select business_id into v_business_id from public.users where id = actor_id;
  if v_business_id is null or v_id is null or v_name is null then
    raise exception using errcode = '22023', message = 'Category identity and name are required';
  end if;

  select business_id, name into v_existing_business, v_existing_name
  from public.categories where id = v_id;
  if v_existing_business is not null and v_existing_business <> v_business_id then
    raise exception using errcode = '42501', message = 'Category belongs to another business';
  end if;

  -- Deleting a category that was never synced up is a no-op, not an error.
  if v_is_deleted then
    if v_existing_business is null then
      return jsonb_build_object('status', 'applied', 'id', v_id, 'deleted', true);
    end if;
    update public.products set category_id = null where category_id = v_id;
    delete from public.categories where id = v_id and business_id = v_business_id;
    return jsonb_build_object('status', 'applied', 'id', v_id, 'deleted', true);
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
  select id into v_existing_id
  from public.categories
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
