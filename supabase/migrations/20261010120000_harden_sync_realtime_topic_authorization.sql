-- Realtime sync topics are a server-published channel, not a client write
-- surface. The durable HTTP sync endpoint remains the source of truth.
--
-- The previous helper trusted the legacy users.role column. That could leave
-- a revoked membership, disabled profile, or stale role able to subscribe
-- until unrelated compatibility data was repaired. Resolve identity through
-- the authoritative membership/account helpers instead.

create or replace function public.auth_can_receive_sync_topic(topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_branch_id uuid;
  v_match text[];
  v_account_type text;
begin
  v_match := regexp_match(topic, '^sync:business:([0-9a-fA-F-]{36})(:branch:([0-9a-fA-F-]{36}))?$');
  if v_match is null or auth.uid() is null then
    return false;
  end if;

  v_business_id := v_match[1]::uuid;
  v_branch_id := nullif(v_match[3], '')::uuid;
  v_account_type := public.auth_account_type();

  -- Membership/account helpers enforce active membership and an active,
  -- verified business. Keep the profile flag as an additional lifecycle
  -- guard so disabled users lose access immediately.
  if not exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.business_id = v_business_id
      and u.is_active = true
  ) then
    return false;
  end if;

  if v_account_type = 'BUSINESS_OWNER' then
    return public.auth_can_access_business(v_business_id)
      and (v_branch_id is null or public.auth_can_access_branch(v_business_id, v_branch_id));
  end if;

  -- Workers never join a business-wide topic. Branch topics carry only a
  -- wake-up hint; the follow-up cursor pull still applies capability and
  -- branch filters to every dataset.
  if v_account_type = 'WORKER' and v_branch_id is not null then
    return public.auth_can_access_branch(v_business_id, v_branch_id)
      and (
        public.auth_worker_has_capability('VIEW_PRODUCTS')
        or public.auth_worker_has_capability('VIEW_BRANCH_STOCK')
        or public.auth_worker_has_capability('VIEW_CUSTOMERS')
        or public.auth_worker_has_capability('VIEW_OWN_SALES')
        or public.auth_worker_has_capability('VIEW_STOCK_MOVEMENTS')
        or public.auth_worker_has_capability('RECEIVE_STOCK')
        or public.auth_worker_has_capability('MANAGE_EXPENSES')
      );
  end if;

  return false;
end;
$$;

revoke execute on function public.auth_can_receive_sync_topic(text) from public, anon;
grant execute on function public.auth_can_receive_sync_topic(text) to authenticated, service_role;

do $$
begin
  if to_regclass('realtime.messages') is not null then
    -- Only the backend service-role publisher may send sync messages. There
    -- is intentionally no authenticated INSERT policy for these topics.
    execute 'revoke insert on realtime.messages from anon, authenticated';
    execute 'drop policy if exists sync_hint_receive on realtime.messages';
    execute $policy$
      create policy sync_hint_receive
      on realtime.messages
      for select
      to authenticated
      using (
        extension = 'broadcast'
        and public.auth_can_receive_sync_topic(realtime.topic())
      )
    $policy$;
  end if;
end
$$;
