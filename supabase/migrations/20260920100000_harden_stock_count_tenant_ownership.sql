-- Stock-count submissions run through a SECURITY DEFINER RPC. Validate every
-- referenced tenant row inside the database so a crafted worker payload cannot
-- attach another business's product to this business's stock-count ledger.

create or replace function public.sync_apply_stock_count(payload jsonb, actor_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_business_id uuid;
  v_branch_id uuid := (payload->>'branchId')::uuid;
  v_product_id uuid := (payload->>'productId')::uuid;
  v_client_id uuid := (payload->>'clientId')::uuid;
  v_submission_id uuid := coalesce((payload->>'id')::uuid, gen_random_uuid());
  v_expected integer;
  v_counted integer := (payload->>'countedQuantity')::integer;
  v_existing uuid;
  v_existing_business_id uuid;
begin
  select u.business_id into v_business_id
  from public.users u
  join public.business_memberships m on m.user_id = u.id and m.business_id = u.business_id
  join public.business_profile b on b.id = u.business_id
  where u.id = actor_id and u.account_type = 'WORKER' and u.is_active = true
    and m.account_type = 'WORKER' and m.status = 'active'
    and b.status in ('verified', 'active');

  if v_business_id is null then
    raise exception using errcode = '42501', message = 'Worker account is not active';
  end if;
  if not exists (
    select 1 from public.user_branches ub
    where ub.user_id = actor_id and ub.business_id = v_business_id and ub.branch_id = v_branch_id
  ) then
    raise exception using errcode = '42501', message = 'Branch is outside this account''s assigned branches';
  end if;
  if not exists (
    select 1 from public.worker_permissions wp
    where wp.user_id = actor_id and wp.business_id = v_business_id
      and wp.permission = 'SUBMIT_STOCK_COUNT' and wp.enabled = true
  ) then
    raise exception using errcode = '42501', message = 'Worker cannot submit stock counts';
  end if;

  perform public.tenant_owns_entity(v_business_id, 'branches', v_branch_id);
  perform public.tenant_owns_entity(v_business_id, 'products', v_product_id);

  select coalesce(quantity, 0)::integer into v_expected
  from public.inventory_stock
  where product_id = v_product_id and branch_id = v_branch_id;

  select id, business_id into v_existing, v_existing_business_id
  from public.stock_count_submissions
  where client_id = v_client_id;
  if v_existing is not null then
    if v_existing_business_id <> v_business_id then
      raise exception using errcode = '42501', message = 'Stock-count mutation belongs to another business';
    end if;
    return jsonb_build_object('status', 'skipped', 'id', v_existing);
  end if;

  insert into public.stock_count_submissions (
    id, client_id, business_id, branch_id, product_id, expected_quantity,
    counted_quantity, discrepancy, reason_code, note, created_by_user_id
  ) values (
    v_submission_id, v_client_id, v_business_id, v_branch_id, v_product_id,
    coalesce(v_expected, 0), v_counted, v_counted - coalesce(v_expected, 0),
    payload->>'reasonCode', payload->>'note', actor_id
  );
  return jsonb_build_object('status', 'applied', 'id', v_submission_id, 'review', 'pending');
end;
$$;

revoke execute on function public.sync_apply_stock_count(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.sync_apply_stock_count(jsonb, uuid) to service_role;
