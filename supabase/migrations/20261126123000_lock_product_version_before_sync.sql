-- Serialize competing edits to an existing product before testing its version.
-- Preserve the current RPC definition, including its authorization guards.
do $product_version_lock$
declare
  v_definition text := pg_get_functiondef('public.sync_apply_product(jsonb,uuid)'::regprocedure);
  v_find text := 'select version into v_current_version from public.products where id = v_id;';
  v_replace text := 'select version into v_current_version from public.products where id = v_id and business_id = v_business_id for update;';
begin
  if length(v_definition) - length(replace(v_definition, v_find, '')) <> length(v_find) then
    raise exception 'Could not safely install the product sync version lock';
  end if;
  execute replace(v_definition, v_find, v_replace);
end;
$product_version_lock$;
