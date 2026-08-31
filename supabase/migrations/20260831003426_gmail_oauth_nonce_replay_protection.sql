-- Gmail OAuth state must be consumed exactly once, independently from the
-- browser cookie. The private table stores only an HMAC hash of the nonce.
create table app_private.gmail_oauth_nonces (
  nonce_hash text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  expires_at timestamptz not null default (pg_catalog.clock_timestamp() + interval '10 minutes'),
  consumed_at timestamptz,
  constraint gmail_oauth_nonce_hash_present check (pg_catalog.length(nonce_hash) between 32 and 256),
  constraint gmail_oauth_nonce_expiry_valid check (expires_at > created_at)
);

create index gmail_oauth_nonces_expiry_idx
  on app_private.gmail_oauth_nonces (expires_at)
  where consumed_at is null;

revoke all on app_private.gmail_oauth_nonces from public, anon, authenticated;

create or replace function public.create_gmail_oauth_nonce(
  target_nonce_hash text,
  target_workspace_id uuid,
  target_user_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if target_nonce_hash is null or pg_catalog.length(target_nonce_hash) not between 32 and 256 then
    raise exception 'invalid OAuth nonce hash' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.workspace_members membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = target_user_id
      and membership.status = 'active'
  ) then
    raise exception 'inactive workspace membership' using errcode = '42501';
  end if;

  insert into app_private.gmail_oauth_nonces (
    nonce_hash,
    workspace_id,
    user_id,
    expires_at
  ) values (
    target_nonce_hash,
    target_workspace_id,
    target_user_id,
    pg_catalog.clock_timestamp() + interval '10 minutes'
  );
end;
$function$;

create or replace function public.consume_gmail_oauth_nonce(
  target_nonce_hash text,
  target_workspace_id uuid,
  target_user_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  consumed_hash text;
begin
  update app_private.gmail_oauth_nonces
  set consumed_at = pg_catalog.clock_timestamp()
  where nonce_hash = target_nonce_hash
    and workspace_id = target_workspace_id
    and user_id = target_user_id
    and consumed_at is null
    and expires_at > pg_catalog.clock_timestamp()
  returning nonce_hash into consumed_hash;

  return pg_catalog.coalesce(consumed_hash = target_nonce_hash, false);
end;
$function$;

revoke all on function public.create_gmail_oauth_nonce(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.consume_gmail_oauth_nonce(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_gmail_oauth_nonce(text, uuid, uuid) to service_role;
grant execute on function public.consume_gmail_oauth_nonce(text, uuid, uuid) to service_role;
