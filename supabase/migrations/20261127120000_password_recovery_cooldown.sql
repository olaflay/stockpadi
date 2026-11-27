create table public.password_recovery_requests (
  email_hash text primary key,
  retry_after timestamptz not null
);

create index password_recovery_requests_retry_after_idx
  on public.password_recovery_requests (retry_after);

alter table public.password_recovery_requests enable row level security;
revoke all on public.password_recovery_requests from public, anon, authenticated, service_role;

create function public.claim_password_recovery_request(p_email_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  -- Retain only recent rate-limit records, with bounded cleanup per request.
  delete from public.password_recovery_requests
  where email_hash in (
    select email_hash from public.password_recovery_requests
    where retry_after < v_now - interval '1 hour'
    order by retry_after
    limit 100
  );

  insert into public.password_recovery_requests as requests (email_hash, retry_after)
  values (p_email_hash, v_now + interval '1 minute')
  on conflict (email_hash) do update
    set retry_after = excluded.retry_after
    where requests.retry_after <= v_now;

  return found;
end;
$$;

revoke all on function public.claim_password_recovery_request(text) from public, anon, authenticated;
grant execute on function public.claim_password_recovery_request(text) to service_role;
