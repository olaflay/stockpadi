-- Single authoritative owner provisioning transaction.
-- Auth user creation happens first in the Edge Function; this function owns
-- every public-table write and rolls them back together on failure.
create or replace function public.provision_business_owner(
  p_user_id uuid,
  p_full_name text,
  p_business_name text,
  p_business_type text
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_business_id uuid;
begin
  if p_user_id is null or nullif(trim(p_full_name), '') is null
     or nullif(trim(p_business_name), '') is null
     or nullif(trim(p_business_type), '') is null then
    raise exception 'Owner and business details are required';
  end if;

  select business_id into v_business_id
  from public.users
  where id = p_user_id and account_type = 'BUSINESS_OWNER'
  limit 1;
  if v_business_id is not null then
    return v_business_id;
  end if;

  insert into public.business_profile (name, business_type, currency, status, is_active)
  values (trim(p_business_name), trim(p_business_type), 'NGN', 'pending', true)
  returning id into v_business_id;

  insert into public.users (id, business_id, full_name, role, account_type, is_active)
  values (p_user_id, v_business_id, trim(p_full_name), 'owner', 'BUSINESS_OWNER', true);

  insert into public.branches (business_id, name, is_active)
  values (v_business_id, 'Main branch', true);

  insert into public.business_memberships (user_id, business_id, role, type, account_type, status)
  values (p_user_id, v_business_id, 'owner', 'owner', 'BUSINESS_OWNER', 'active');

  return v_business_id;
end;
$$;

revoke all on function public.provision_business_owner(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.provision_business_owner(uuid, text, text, text) to service_role;
