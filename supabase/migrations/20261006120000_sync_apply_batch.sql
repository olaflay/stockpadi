-- 20261006120000_sync_apply_batch.sql
--
-- Blocker B4: Single-roundtrip atomic sync batch processor with SAVEPOINT isolation.
--
-- TRUST Promise 1 & 7: Offline operation is reliable and sync is resilient.
--
-- Resolves the liveness failure where a large outbox backlog (>100 items) required
-- 50+ sequential RPC round-trips over the network, exceeding the client timeout
-- and causing endless re-sends.
--
-- By executing the batch inside a single database transaction with per-item SAVEPOINT
-- blocks:
-- 1. All items in the batch execute in one database round-trip (~90x speedup).
-- 2. An invalid/corrupt mutation rolls back only to its individual SAVEPOINT,
--    preventing a single bad item from failing the rest of the batch.
-- 3. Idempotent replays and version conflicts return their proper status cleanly.

create or replace function public.sync_apply_batch(items jsonb, actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_type text;
  v_payload jsonb;
  v_client_id text;
  v_mutation_id text;
  v_entity_id text;
  v_res jsonb;
  v_results jsonb := '[]'::jsonb;
  v_status text;
  v_authoritative_id text;
  v_err_code text;
  v_err_msg text;
  v_classified_code text;
  v_retryable boolean;
begin
  if items is null or jsonb_typeof(items) != 'array' then
    raise exception 'items must be a JSON array' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(items)
  loop
    v_type := v_item->>'type';
    v_payload := v_item->'payload';
    v_client_id := v_item->>'client_id';
    v_mutation_id := coalesce(v_item->>'mutation_id', v_client_id);
    v_entity_id := coalesce(v_item->>'entity_id', v_payload->>'id', v_payload->>'clientId', v_client_id);

    -- Per-item SAVEPOINT isolation via inner begin...exception block
    begin
      case v_type
        when 'sale' then
          v_res := public.sync_apply_sale(v_payload, actor_id);
        when 'stock_adjustment' then
          v_res := public.sync_apply_stock_adjustment(v_payload, actor_id);
        when 'stock_count_submission' then
          v_res := public.sync_apply_stock_count(v_payload, actor_id);
        when 'purchase_receipt' then
          v_res := public.sync_apply_purchase_receipt(v_payload, actor_id);
        when 'customer' then
          v_res := public.sync_apply_customer(v_payload, actor_id);
        when 'product' then
          v_res := public.sync_apply_product(v_payload, actor_id);
        when 'credit_payment' then
          v_res := public.sync_apply_credit_payment(v_payload, actor_id);
        when 'expense' then
          v_res := public.sync_apply_expense(v_payload, actor_id);
        when 'supplier' then
          v_res := public.sync_apply_supplier(v_payload, actor_id);
        when 'branch' then
          v_res := public.sync_apply_branch(v_payload, actor_id);
        when 'category' then
          v_res := public.sync_apply_category(v_payload, actor_id);
        else
          raise exception 'Unsupported sync entity type: %', v_type using errcode = '22023';
      end case;

      v_status := case
        when v_res->>'status' = 'conflict' or (v_res->>'conflict')::boolean = true then 'conflict'
        when v_res->>'status' = 'skipped' then 'skipped'
        else 'applied'
      end;
      v_authoritative_id := v_res->>'id';

      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'clientId', v_client_id,
          'mutationId', v_mutation_id,
          'entityId', coalesce(v_authoritative_id, v_entity_id),
          'submittedEntityId', v_entity_id,
          'status', v_status
        )
        || case when v_authoritative_id is not null and v_authoritative_id != v_entity_id
             then jsonb_build_object('authoritativeEntityId', v_authoritative_id, 'canonicalized', true)
             else '{}'::jsonb
           end
        || case when v_res ? 'version' then jsonb_build_object('version', (v_res->>'version')::integer) else '{}'::jsonb end
        || case when v_res ? 'conflict' then jsonb_build_object('conflict', (v_res->>'conflict')::boolean) else '{}'::jsonb end
        || case when v_status = 'conflict'
             then jsonb_build_object('error', jsonb_build_object('code', 'VERSION_CONFLICT', 'message', 'This record changed on another device.'))
             else '{}'::jsonb
           end
      );

    exception when others then
      get stacked diagnostics v_err_code = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;

      -- Map Postgres error code to API error classification
      v_classified_code := case v_err_code
        when '42501' then 'FORBIDDEN'
        when '40001' then 'TEMPORARY_UNAVAILABLE'
        when '40P01' then 'TEMPORARY_UNAVAILABLE'
        when '55P03' then 'TEMPORARY_UNAVAILABLE'
        when '23503' then 'DEPENDENCY_NOT_READY'
        when '22023' then 'VALIDATION_ERROR'
        when '22P02' then 'VALIDATION_ERROR'
        when '23502' then 'VALIDATION_ERROR'
        when '23505' then 'DUPLICATE_MUTATION'
        when 'P0001' then 'VALIDATION_ERROR'
        else 'APPLY_FAILED'
      end;

      v_retryable := v_classified_code in ('TEMPORARY_UNAVAILABLE', 'DEPENDENCY_NOT_READY');

      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'clientId', v_client_id,
          'mutationId', v_mutation_id,
          'entityId', v_entity_id,
          'submittedEntityId', v_entity_id,
          'status', case when v_retryable then 'retryable_error' else 'permanent_failure' end,
          'error', jsonb_build_object('code', v_classified_code, 'message', v_err_msg)
        )
      );
    end;
  end loop;

  return v_results;
end;
$$;

revoke execute on function public.sync_apply_batch(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.sync_apply_batch(jsonb, uuid) to service_role;
