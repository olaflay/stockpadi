-- Registration and account lifecycle guardrails.
-- Public signup is owner/business signup only. Platform admins are provisioned
-- through the one-time server-side script, never through the public form.

create unique index if not exists platform_admins_one_account_idx
  on public.platform_admins ((true));

create or replace function public.handle_new_owner()
returns trigger as $$
declare
  v_business_id uuid;
  v_account_type text := new.raw_user_meta_data->>'account_type';
  v_role text := new.raw_user_meta_data->>'role';
begin
  -- An ADMIN auth user is deliberately left for the secure provisioning
  -- script to attach to platform_admins. This prevents a synthetic tenant.
  if v_account_type = 'ADMIN' then
    return new;
  end if;

  -- Auth users created by a trusted worker/admin flow and internal fixtures
  -- must not be silently turned into tenant owners.
  if v_role is distinct from 'owner' and v_account_type is distinct from 'BUSINESS_OWNER' then
    return new;
  end if;

  -- Every public signup is a Business Owner. Never trust a role supplied by
  -- a browser or OAuth metadata to create an admin/worker account.
  insert into public.business_profile (name, business_type, currency, status)
  values (
    coalesce(new.raw_user_meta_data->>'business_name', 'My Store'),
    coalesce(new.raw_user_meta_data->>'business_type_id', 'general_retail'),
    'NGN',
    'pending'
  ) returning id into v_business_id;

  insert into public.users (id, business_id, full_name, role, account_type, is_active)
  values (
    new.id,
    v_business_id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'owner',
    'BUSINESS_OWNER',
    true
  );

  insert into public.branches (business_id, name, is_active)
  values (v_business_id, 'Main branch', true);

  insert into public.business_memberships (user_id, business_id, role, type, status)
  values (new.id, v_business_id, 'owner', 'owner', 'active')
  on conflict (user_id, business_id) do update
    set type = 'owner', status = 'active';

  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- Keep the historical role column for compatibility, but make the new
-- platform-admin table the independent source of platform authorization.
comment on index public.platform_admins_one_account_idx is
  'StockPadi has exactly one platform admin account.';
