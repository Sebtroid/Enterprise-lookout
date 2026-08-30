-- Keep decrypted Vault access behind the service role and the application server.
create or replace function public.get_workspace_runtime_secret(
  target_workspace_id uuid,
  target_secret_key text
)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select app_private.get_workspace_secret(target_workspace_id, target_secret_key)
$function$;

revoke all on function public.get_workspace_runtime_secret(uuid, text) from public, anon, authenticated;
grant execute on function public.get_workspace_runtime_secret(uuid, text) to service_role;

create or replace function public.workspace_secret_status(target_workspace_id uuid)
returns table (secret_key text, is_configured boolean, updated_at timestamptz)
language sql stable security definer set search_path = ''
as $function$
  select mapping.secret_key, true, mapping.updated_at
  from app_private.workspace_vault_secrets mapping
  where mapping.workspace_id = target_workspace_id
  order by mapping.secret_key
$function$;

create or replace function public.reveal_workspace_secret(target_workspace_id uuid, target_secret_key text)
returns text
language sql stable security definer set search_path = ''
as $function$
  select app_private.get_workspace_secret(target_workspace_id, target_secret_key)
$function$;

create or replace function public.replace_workspace_secret(target_workspace_id uuid, target_secret_key text, target_secret_value text)
returns void
language plpgsql volatile security definer set search_path = ''
as $function$
declare
  existing_secret_id uuid;
  stored_secret_id uuid;
  vault_name text;
begin
  if target_secret_key is null or target_secret_key not in (
    'supabase-db-password', 'gmail-client-id', 'gmail-client-secret',
    'gmail-token-encryption-key', 'microsoft-client-id',
    'microsoft-client-secret', 'microsoft-tenant-id', 'minimax-api-key',
    'minimax-model', 'hunter-api-key', 'cron-secret'
  ) then raise exception 'unsupported secret key' using errcode = '22023'; end if;
  if target_secret_value is null or length(target_secret_value) = 0 or length(target_secret_value) > 16384
    then raise exception 'invalid secret value' using errcode = '22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_workspace_id::text || ':' || target_secret_key, 0));
  select mapping.vault_secret_id into existing_secret_id
  from app_private.workspace_vault_secrets mapping
  where mapping.workspace_id = target_workspace_id and mapping.secret_key = target_secret_key
  for update;
  vault_name := 'enterprise-lookout:' || target_workspace_id::text || ':' || target_secret_key;
  if existing_secret_id is null then
    stored_secret_id := vault.create_secret(target_secret_value, vault_name, 'Enterprise Lookout workspace credential', null);
    insert into app_private.workspace_vault_secrets (workspace_id, secret_key, vault_secret_id)
    values (target_workspace_id, target_secret_key, stored_secret_id);
  else
    perform vault.update_secret(existing_secret_id, target_secret_value, vault_name, 'Enterprise Lookout workspace credential', null);
    update app_private.workspace_vault_secrets set updated_at = now()
    where workspace_id = target_workspace_id and secret_key = target_secret_key;
  end if;
end;
$function$;

revoke all on function public.workspace_secret_status(uuid) from public, anon, authenticated;
revoke all on function public.replace_workspace_secret(uuid, text, text) from public, anon, authenticated;
revoke all on function public.reveal_workspace_secret(uuid, text) from public, anon, authenticated;
grant execute on function public.workspace_secret_status(uuid) to service_role;
grant execute on function public.replace_workspace_secret(uuid, text, text) to service_role;
grant execute on function public.reveal_workspace_secret(uuid, text) to service_role;
