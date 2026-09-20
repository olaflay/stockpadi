-- Forward-only convergence and branch integrity hardening.
-- The stock ledger remains append-only; inventory_stock_rollup is only its
-- trigger-maintained projection and is never a direct write surface.

alter table public.branches add column if not exists is_primary boolean not null default false;

with ranked as (
  select id, row_number() over (partition by business_id order by created_at asc, id asc) as rank
  from public.branches
  where is_active = true
)
update public.branches b
set is_primary = ranked.rank = 1
from ranked
where b.id = ranked.id;

create unique index if not exists branches_one_active_primary_idx
  on public.branches (business_id)
  where is_active = true and is_primary = true;

alter table public.suppliers add column if not exists updated_at timestamptz not null default now();
update public.suppliers set updated_at = coalesce(updated_at, created_at, now());
drop trigger if exists suppliers_set_updated_at on public.suppliers;
create trigger suppliers_set_updated_at before update on public.suppliers
for each row execute function public.set_updated_at();
create index if not exists suppliers_updated_at_idx on public.suppliers (updated_at, id);

alter table public.inventory_stock_rollup add column if not exists updated_at timestamptz not null default now();
create index if not exists inventory_stock_rollup_updated_at_idx on public.inventory_stock_rollup (updated_at, product_id, branch_id);

create or replace view public.inventory_stock with (security_invoker = true) as
select product_id, branch_id, quantity, updated_at
from public.inventory_stock_rollup;

create or replace function public.stock_movements_bump_rollup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.inventory_stock_rollup (product_id, branch_id, quantity, updated_at)
  values (new.product_id, new.branch_id, new.quantity_delta, now())
  on conflict (product_id, branch_id)
  do update set quantity = public.inventory_stock_rollup.quantity + excluded.quantity,
                updated_at = now();
  return new;
end;
$$;

create or replace function public.provision_business_owner(
  p_user_id uuid, p_full_name text, p_business_name text, p_business_type text
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_business_id uuid; v_existing_branch_id uuid;
begin
  if p_user_id is null or nullif(trim(p_full_name), '') is null
     or nullif(trim(p_business_name), '') is null or nullif(trim(p_business_type), '') is null then
    raise exception 'Owner and business details are required';
  end if;
  select business_id into v_business_id from public.users
  where id = p_user_id and account_type = 'BUSINESS_OWNER';
  if v_business_id is not null then return v_business_id; end if;
  insert into public.business_profile (name, business_type, currency, status, is_active)
  values (trim(p_business_name), trim(p_business_type), 'NGN', 'pending', true)
  returning id into v_business_id;
  insert into public.users (id, business_id, full_name, role, account_type, is_active)
  values (p_user_id, v_business_id, trim(p_full_name), 'owner', 'BUSINESS_OWNER', true);
  insert into public.branches (business_id, name, is_active, is_primary)
  values (v_business_id, 'Main branch', true, true)
  returning id into v_existing_branch_id;
  insert into public.business_memberships (user_id, business_id, role, type, account_type, status)
  values (p_user_id, v_business_id, 'owner', 'owner', 'BUSINESS_OWNER', 'active');
  return v_business_id;
end;
$$;

create or replace function public.sync_apply_branch(payload jsonb, actor_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_business_id uuid; v_id uuid := (payload->>'id')::uuid;
  v_name text := btrim(payload->>'name');
  v_is_active boolean := coalesce((payload->>'isActive')::boolean, true);
  v_is_primary boolean := coalesce((payload->>'isPrimary')::boolean, false);
  v_existing_business uuid; v_was_primary boolean; v_active_count integer; v_has_primary boolean := payload ? 'isPrimary';
begin
  select business_id, is_primary into v_existing_business, v_was_primary from public.branches where id = v_id;
  select business_id into v_business_id from public.users where id = actor_id;
  if v_business_id is null then raise exception using errcode = '42501', message = 'Missing business context'; end if;
  if v_id is null or v_name is null or v_name = '' then raise exception using errcode = '22023', message = 'Branch id and name are required'; end if;
  if v_existing_business is not null and v_existing_business <> v_business_id then raise exception using errcode = '42501', message = 'Branch belongs to another business'; end if;
  if v_existing_business is null then
    select count(*) into v_active_count from public.branches where business_id = v_business_id and is_active;
    if v_active_count >= 6 then raise exception using errcode = '23505', message = 'Branch limit reached'; end if;
    if v_is_active and not exists (select 1 from public.branches where business_id = v_business_id and is_active and is_primary) then v_is_primary := true; end if;
    if v_is_primary then update public.branches set is_primary = false where business_id = v_business_id; end if;
    insert into public.branches (id, business_id, name, is_active, is_primary)
    values (v_id, v_business_id, v_name, v_is_active, v_is_primary);
  else
    if not v_has_primary then v_is_primary := v_was_primary; end if;
    if v_was_primary and not v_is_active then raise exception using errcode = '23514', message = 'The primary branch must be changed before it is archived'; end if;
    if v_was_primary and v_is_active and not v_is_primary then raise exception using errcode = '23514', message = 'A business must keep one active primary branch'; end if;
    if not v_is_active then
      select count(*) into v_active_count from public.branches where business_id = v_business_id and is_active;
      if v_active_count <= 1 then raise exception using errcode = '23514', message = 'A business must keep one active branch'; end if;
    end if;
    if v_is_primary and v_is_active then update public.branches set is_primary = false where business_id = v_business_id and id <> v_id; end if;
    update public.branches set name = v_name, is_active = v_is_active, is_primary = v_is_primary and v_is_active, updated_at = now()
    where id = v_id and business_id = v_business_id;
  end if;
  return jsonb_build_object('status', 'applied', 'id', v_id);
end;
$$;

revoke all on function public.sync_apply_branch(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.sync_apply_branch(jsonb, uuid) to service_role;
