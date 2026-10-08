-- Event-driven synchronization uses private Supabase Broadcast topics only as
-- wake-up hints. The HTTP cursor pull remains the source of truth.
--
-- PGlite does not ship Supabase's managed `realtime` schema. The authorization
-- helper is still created there, while the managed-table policies are installed
-- only when the schema exists in the deployment.

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
begin
  v_match := regexp_match(topic, '^sync:business:([0-9a-fA-F-]{36})(:branch:([0-9a-fA-F-]{36}))?$');
  if v_match is null then
    return false;
  end if;

  v_business_id := v_match[1]::uuid;
  v_branch_id := nullif(v_match[3], '')::uuid;

  return exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.business_id = v_business_id
      and u.is_active
      and (
        (v_branch_id is null and u.role in ('owner', 'manager', 'accountant', 'admin'))
        or
        (v_branch_id is not null and (
          u.role in ('owner', 'manager', 'accountant', 'admin')
          or exists (
            select 1
            from public.user_branches ub
            where ub.user_id = u.id
              and ub.business_id = v_business_id
              and ub.branch_id = v_branch_id
          )
        ))
      )
  );
end;
$$;

revoke execute on function public.auth_can_receive_sync_topic(text) from public, anon;
grant execute on function public.auth_can_receive_sync_topic(text) to authenticated, service_role;

do $$
begin
  if to_regclass('realtime.messages') is not null then
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
