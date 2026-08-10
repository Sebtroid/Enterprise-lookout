-- Persist workspace AI policy and owner-managed credentials in Supabase Vault.

create extension if not exists supabase_vault with schema vault;

create table public.workspace_ai_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  minimax_monthly_budget_usd numeric(10,2) not null default 5.00
    check (minimax_monthly_budget_usd >= 0 and minimax_monthly_budget_usd <= 1000000),
  budget_warning_percent smallint not null default 80
    check (budget_warning_percent between 1 and 100),
  budget_hard_stop boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workspace_ai_settings_updated_idx
  on public.workspace_ai_settings (updated_at desc);

insert into public.workspace_ai_settings (workspace_id, minimax_monthly_budget_usd)
values ('00000000-0000-4000-8000-000000000001', 5.00)
on conflict (workspace_id) do nothing;

alter table public.workspace_ai_settings enable row level security;

create policy "members view workspace ai settings"
on public.workspace_ai_settings for select to authenticated
using (app_private.is_workspace_member(workspace_id));

create policy "owners create workspace ai settings"
on public.workspace_ai_settings for insert to authenticated
with check (app_private.is_workspace_owner(workspace_id));

create policy "owners update workspace ai settings"
on public.workspace_ai_settings for update to authenticated
using (app_private.is_workspace_owner(workspace_id))
with check (app_private.is_workspace_owner(workspace_id));

grant select, insert, update on public.workspace_ai_settings to authenticated;
grant select, insert, update, delete on public.workspace_ai_settings to service_role;

create table app_private.workspace_vault_secrets (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  secret_key text not null check (secret_key in (
    'supabase-db-password',
    'gmail-client-id',
    'gmail-client-secret',
    'gmail-token-encryption-key',
    'microsoft-client-id',
    'microsoft-client-secret',
    'microsoft-tenant-id',
    'minimax-api-key',
    'minimax-model',
    'hunter-api-key',
    'cron-secret'
  )),
  vault_secret_id uuid not null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, secret_key),
  unique (vault_secret_id)
);

create index workspace_vault_secrets_updated_idx
  on app_private.workspace_vault_secrets (workspace_id, updated_at desc);

revoke all on table app_private.workspace_vault_secrets from public, anon, authenticated;
grant usage on schema app_private to service_role;
grant select, insert, update, delete on table app_private.workspace_vault_secrets to service_role;

create or replace function public.workspace_secret_status(target_workspace_id uuid)
returns table (secret_key text, is_configured boolean, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null
    or not app_private.is_workspace_owner(target_workspace_id) then
    raise exception 'workspace owner required' using errcode = '42501';
  end if;

  return query
  select mapping.secret_key, true, mapping.updated_at
  from app_private.workspace_vault_secrets mapping
  where mapping.workspace_id = target_workspace_id
  order by mapping.secret_key;
end;
$function$;

create or replace function public.replace_workspace_secret(
  target_workspace_id uuid,
  target_secret_key text,
  target_secret_value text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  existing_secret_id uuid;
  stored_secret_id uuid;
  vault_name text;
begin
  if (select auth.uid()) is null
    or not app_private.is_workspace_owner(target_workspace_id) then
    raise exception 'workspace owner required' using errcode = '42501';
  end if;

  if target_secret_key is null or target_secret_key not in (
    'supabase-db-password', 'gmail-client-id', 'gmail-client-secret',
    'gmail-token-encryption-key', 'microsoft-client-id',
    'microsoft-client-secret', 'microsoft-tenant-id', 'minimax-api-key',
    'minimax-model', 'hunter-api-key', 'cron-secret'
  ) then
    raise exception 'unsupported secret key' using errcode = '22023';
  end if;

  if target_secret_value is null
    or length(target_secret_value) = 0
    or length(target_secret_value) > 16384 then
    raise exception 'invalid secret value' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_workspace_id::text || ':' || target_secret_key, 0)
  );

  select mapping.vault_secret_id
  into existing_secret_id
  from app_private.workspace_vault_secrets mapping
  where mapping.workspace_id = target_workspace_id
    and mapping.secret_key = target_secret_key
  for update;

  vault_name := 'enterprise-lookout:' || target_workspace_id::text || ':' || target_secret_key;

  if existing_secret_id is null then
    stored_secret_id := vault.create_secret(
      target_secret_value,
      vault_name,
      'Enterprise Lookout workspace credential',
      null
    );
    insert into app_private.workspace_vault_secrets (
      workspace_id, secret_key, vault_secret_id, updated_by
    ) values (
      target_workspace_id, target_secret_key, stored_secret_id, (select auth.uid())
    );
  else
    perform vault.update_secret(
      existing_secret_id,
      target_secret_value,
      vault_name,
      'Enterprise Lookout workspace credential',
      null
    );
    update app_private.workspace_vault_secrets
    set updated_by = (select auth.uid()), updated_at = now()
    where workspace_id = target_workspace_id
      and secret_key = target_secret_key;
  end if;
end;
$function$;

create or replace function public.reveal_workspace_secret(
  target_workspace_id uuid,
  target_secret_key text
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  secret_value text;
begin
  if (select auth.uid()) is null
    or not app_private.is_workspace_owner(target_workspace_id) then
    raise exception 'workspace owner required' using errcode = '42501';
  end if;

  select decrypted.decrypted_secret
  into secret_value
  from app_private.workspace_vault_secrets mapping
  join vault.decrypted_secrets decrypted on decrypted.id = mapping.vault_secret_id
  where mapping.workspace_id = target_workspace_id
    and mapping.secret_key = target_secret_key;

  if secret_value is null then
    raise exception 'secret not configured' using errcode = 'P0002';
  end if;

  return secret_value;
end;
$function$;

create or replace function app_private.get_workspace_secret(
  target_workspace_id uuid,
  target_secret_key text
)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select decrypted.decrypted_secret
  from app_private.workspace_vault_secrets mapping
  join vault.decrypted_secrets decrypted on decrypted.id = mapping.vault_secret_id
  where mapping.workspace_id = target_workspace_id
    and mapping.secret_key = target_secret_key
$function$;

-- The legacy matcher is invoker-safe, but a pinned lookup path prevents object shadowing.
alter function public.match_ai_memory_events(vector, uuid, uuid, uuid, text[], integer)
  set search_path = extensions, public, pg_temp;

-- Anonymous users never mutate workspace state or execute RPCs. Future postgres-owned
-- objects inherit the same deny-by-default posture.
revoke insert, update, delete, truncate, references, trigger
  on all tables in schema public from anon;
revoke usage, select, update on all sequences in schema public from anon;

alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate, references, trigger on tables from anon;
alter default privileges for role postgres in schema public
  revoke usage, select, update on sequences from anon;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon;

revoke all on function public.workspace_secret_status(uuid) from public, anon;
revoke all on function public.replace_workspace_secret(uuid, text, text) from public, anon;
revoke all on function public.reveal_workspace_secret(uuid, text) from public, anon;
revoke all on function public.match_ai_memory_events(vector, uuid, uuid, uuid, text[], integer)
  from public, anon;
revoke all on function app_private.get_workspace_secret(uuid, text) from public, anon, authenticated;

grant execute on function public.workspace_secret_status(uuid) to authenticated;
grant execute on function public.replace_workspace_secret(uuid, text, text) to authenticated;
grant execute on function public.reveal_workspace_secret(uuid, text) to authenticated;
grant execute on function app_private.get_workspace_secret(uuid, text) to service_role;
grant execute on function public.match_ai_memory_events(vector, uuid, uuid, uuid, text[], integer)
  to authenticated, service_role;
