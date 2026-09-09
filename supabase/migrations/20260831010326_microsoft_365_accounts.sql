-- Microsoft 365 delegated mail accounts. Tokens remain server-only, while
-- permissions and provider ownership mirror the existing Gmail model.
create table public.microsoft_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  email citext not null,
  display_name text,
  graph_user_id text not null,
  encrypted_access_token text not null,
  encrypted_refresh_token text not null,
  expires_at timestamptz not null,
  inbox_delta_link text,
  sync_status text not null default 'pending' check (
    sync_status in ('pending', 'syncing', 'ready', 'error', 'disconnected')
  ),
  initial_sync_after timestamptz not null default (now() - interval '12 months'),
  last_synced_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint microsoft_accounts_workspace_id_id_key unique (workspace_id, id),
  constraint microsoft_accounts_workspace_owner_fk
    foreign key (workspace_id, owner_user_id)
    references public.workspace_members (workspace_id, user_id) on delete restrict,
  unique (workspace_id, email),
  unique (workspace_id, graph_user_id)
);

create table public.microsoft_account_permissions (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  microsoft_account_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  can_read boolean not null default false,
  can_draft boolean not null default false,
  can_send boolean not null default false,
  can_manage boolean not null default false,
  active boolean not null default true,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint microsoft_permissions_workspace_account_fk
    foreign key (workspace_id, microsoft_account_id)
    references public.microsoft_accounts (workspace_id, id) on delete cascade,
  constraint microsoft_permissions_workspace_user_fk
    foreign key (workspace_id, user_id)
    references public.workspace_members (workspace_id, user_id) on delete cascade,
  primary key (microsoft_account_id, user_id)
);

alter table public.sender_identities
  add column microsoft_account_id uuid;

alter table public.sender_identities
  add constraint sender_identities_workspace_microsoft_account_fk
  foreign key (workspace_id, microsoft_account_id)
  references public.microsoft_accounts (workspace_id, id)
  on delete set null (microsoft_account_id);

alter table public.sender_identities
  add constraint sender_identities_exactly_one_mail_provider
  check (
    (not active and gmail_account_id is null and microsoft_account_id is null)
    or ((gmail_account_id is null) <> (microsoft_account_id is null))
  ) not valid;

-- Preserve historical identities/drafts when an account is hard-deleted. The
-- BEFORE trigger makes the subsequent SET NULL FK action compatible with the
-- provider constraint and clearly marks the identity as unusable.
create or replace function app_private.detach_sender_identities_before_account_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_table_name = 'gmail_accounts' then
    update public.sender_identities
    set active = false, updated_at = pg_catalog.clock_timestamp()
    where gmail_account_id = old.id;
  elsif tg_table_name = 'microsoft_accounts' then
    update public.sender_identities
    set active = false, updated_at = pg_catalog.clock_timestamp()
    where microsoft_account_id = old.id;
  end if;
  return old;
end;
$function$;

revoke all on function app_private.detach_sender_identities_before_account_delete() from public, anon, authenticated;

create trigger detach_gmail_sender_identities_before_account_delete
before delete on public.gmail_accounts
for each row execute function app_private.detach_sender_identities_before_account_delete();

create trigger detach_microsoft_sender_identities_before_account_delete
before delete on public.microsoft_accounts
for each row execute function app_private.detach_sender_identities_before_account_delete();

alter table public.mail_threads alter column gmail_account_id drop not null;
alter table public.mail_threads alter column gmail_thread_id drop not null;
alter table public.mail_threads
  add column microsoft_account_id uuid,
  add column microsoft_conversation_id text;
alter table public.mail_threads
  add constraint mail_threads_workspace_microsoft_account_fk
  foreign key (workspace_id, microsoft_account_id)
  references public.microsoft_accounts (workspace_id, id) on delete cascade;
alter table public.mail_threads
  add constraint mail_threads_exactly_one_mail_provider
  check ((gmail_account_id is null) <> (microsoft_account_id is null));
alter table public.mail_threads
  add constraint mail_threads_exactly_one_provider_thread_id
  check ((gmail_thread_id is null) <> (microsoft_conversation_id is null));
alter table public.mail_threads
  add constraint mail_threads_provider_fields_match
  check (
    (gmail_account_id is not null and gmail_thread_id is not null and microsoft_account_id is null and microsoft_conversation_id is null)
    or
    (microsoft_account_id is not null and microsoft_conversation_id is not null and gmail_account_id is null and gmail_thread_id is null)
  );
alter table public.mail_threads
  add constraint mail_threads_microsoft_conversation_unique
  unique (microsoft_account_id, microsoft_conversation_id);

alter table public.mail_messages alter column gmail_message_id drop not null;
alter table public.mail_messages add column microsoft_message_id text;
alter table public.mail_messages
  add constraint mail_messages_exactly_one_provider_message_id
  check ((gmail_message_id is null) <> (microsoft_message_id is null));
alter table public.mail_messages
  add constraint mail_messages_microsoft_message_unique
  unique (thread_id, microsoft_message_id);

create or replace function app_private.enforce_mail_message_provider_matches_thread()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  parent_is_gmail boolean;
  parent_is_microsoft boolean;
begin
  select thread.gmail_account_id is not null, thread.microsoft_account_id is not null
    into parent_is_gmail, parent_is_microsoft
  from public.mail_threads thread
  where thread.id = new.thread_id;

  -- Let the existing thread foreign key report a missing parent.
  if not found then return new; end if;

  if (parent_is_gmail and new.gmail_message_id is null)
    or (parent_is_microsoft and new.microsoft_message_id is null) then
    raise exception 'mail message provider must match its parent thread'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

revoke all on function app_private.enforce_mail_message_provider_matches_thread() from public, anon, authenticated;

create trigger enforce_mail_message_provider_matches_thread
before insert or update of thread_id, gmail_message_id, microsoft_message_id
on public.mail_messages
for each row execute function app_private.enforce_mail_message_provider_matches_thread();

create index microsoft_accounts_workspace_status_idx
  on public.microsoft_accounts (workspace_id, active, sync_status, updated_at desc);
create index microsoft_accounts_owner_user_idx
  on public.microsoft_accounts (owner_user_id);
create index microsoft_permissions_user_active_idx
  on public.microsoft_account_permissions (user_id, active, microsoft_account_id);
create index microsoft_permissions_workspace_account_idx
  on public.microsoft_account_permissions (workspace_id, microsoft_account_id);
create index sender_identities_microsoft_account_idx
  on public.sender_identities (microsoft_account_id) where microsoft_account_id is not null;
create index mail_threads_microsoft_updated_idx
  on public.mail_threads (microsoft_account_id, updated_at desc) where microsoft_account_id is not null;

create or replace function app_private.can_use_microsoft_account(
  target_account_id uuid,
  required_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.microsoft_accounts account
    left join public.microsoft_account_permissions permission
      on permission.microsoft_account_id = account.id
     and permission.workspace_id = account.workspace_id
     and permission.user_id = (select auth.uid())
     and permission.active
    where account.id = target_account_id
      and account.active
      and app_private.is_workspace_member(account.workspace_id)
      and (
        account.owner_user_id = (select auth.uid())
        or permission.can_manage
        or (required_permission = 'read' and permission.can_read)
        or (required_permission = 'draft' and permission.can_draft)
        or (required_permission = 'send' and permission.can_send)
        or (required_permission = 'manage' and permission.can_manage)
      )
  )
$function$;

revoke all on function app_private.can_use_microsoft_account(uuid, text) from public;
grant execute on function app_private.can_use_microsoft_account(uuid, text) to authenticated;

alter table public.microsoft_accounts enable row level security;
create policy "permitted users view microsoft accounts" on public.microsoft_accounts
for select to authenticated using (app_private.can_use_microsoft_account(id, 'read'));
create policy "members connect own microsoft accounts" on public.microsoft_accounts
for insert to authenticated with check (
  owner_user_id = (select auth.uid())
  and app_private.is_workspace_member(workspace_id)
);
create policy "microsoft administrators update accounts" on public.microsoft_accounts
for update to authenticated
using (app_private.can_use_microsoft_account(id, 'manage'))
with check (app_private.can_use_microsoft_account(id, 'manage'));

alter table public.microsoft_account_permissions enable row level security;
create policy "workspace members view microsoft permissions" on public.microsoft_account_permissions
for select to authenticated using (
  exists (
    select 1 from public.microsoft_accounts account
    where account.id = microsoft_account_id
      and app_private.is_workspace_member(account.workspace_id)
  )
);
create policy "microsoft administrators manage permissions" on public.microsoft_account_permissions
for all to authenticated
using (app_private.can_use_microsoft_account(microsoft_account_id, 'manage'))
with check (app_private.can_use_microsoft_account(microsoft_account_id, 'manage'));

create or replace function app_private.can_link_sender_identity_provider(
  target_workspace_id uuid,
  target_gmail_account_id uuid,
  target_microsoft_account_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    ((target_gmail_account_id is null) <> (target_microsoft_account_id is null))
    and app_private.is_workspace_member(target_workspace_id)
    and case
      when target_gmail_account_id is not null then exists (
        select 1 from public.gmail_accounts account
        where account.id = target_gmail_account_id
          and account.workspace_id = target_workspace_id
          and account.active
          and app_private.can_use_gmail_account(account.id, 'manage')
      )
      else exists (
        select 1 from public.microsoft_accounts account
        where account.id = target_microsoft_account_id
          and account.workspace_id = target_workspace_id
          and account.active
          and app_private.can_use_microsoft_account(account.id, 'manage')
      )
    end
$function$;

revoke all on function app_private.can_link_sender_identity_provider(uuid, uuid, uuid) from public;
grant execute on function app_private.can_link_sender_identity_provider(uuid, uuid, uuid) to authenticated;

drop policy if exists "users create own identities" on public.sender_identities;
drop policy if exists "users manage own identities" on public.sender_identities;
create policy "users create own identities" on public.sender_identities for insert to authenticated
with check (
  user_id = (select auth.uid())
  and app_private.can_link_sender_identity_provider(workspace_id, gmail_account_id, microsoft_account_id)
);
create policy "users manage own identities" on public.sender_identities for update to authenticated
using (user_id = (select auth.uid()) or app_private.is_workspace_owner(workspace_id))
with check (
  (user_id = (select auth.uid()) or app_private.is_workspace_owner(workspace_id))
  and app_private.can_link_sender_identity_provider(workspace_id, gmail_account_id, microsoft_account_id)
);

create or replace function app_private.can_assign_draft_sender(
  target_workspace_id uuid,
  target_sender_identity_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select target_sender_identity_id is not null
    and (select auth.uid()) is not null
    and app_private.is_workspace_member(target_workspace_id)
    and exists (
      select 1
      from public.sender_identities identity
      left join public.gmail_accounts gmail
        on gmail.id = identity.gmail_account_id
       and gmail.workspace_id = target_workspace_id
       and gmail.active
      left join public.gmail_account_permissions gmail_permission
        on gmail_permission.gmail_account_id = gmail.id
       and gmail_permission.user_id = (select auth.uid())
       and gmail_permission.active
      left join public.microsoft_accounts microsoft
        on microsoft.id = identity.microsoft_account_id
       and microsoft.workspace_id = target_workspace_id
       and microsoft.active
      left join public.microsoft_account_permissions permission
        on permission.microsoft_account_id = microsoft.id
       and permission.workspace_id = target_workspace_id
       and permission.user_id = (select auth.uid())
       and permission.active
      where identity.id = target_sender_identity_id
        and identity.workspace_id = target_workspace_id
        and identity.active
        and (
          (gmail.id is not null and gmail_permission.can_draft and gmail_permission.can_send)
          or
          (microsoft.id is not null and permission.can_draft and permission.can_send)
        )
    )
$function$;

revoke all on function app_private.can_assign_draft_sender(uuid, uuid) from public;
grant execute on function app_private.can_assign_draft_sender(uuid, uuid) to authenticated;

drop policy if exists "permitted users view mail threads" on public.mail_threads;
drop policy if exists "permitted users manage mail threads" on public.mail_threads;
create policy "permitted users view mail threads" on public.mail_threads
for select to authenticated using (
  app_private.is_workspace_member(workspace_id)
  and (
    project_id is not null
    or (gmail_account_id is not null and app_private.can_use_gmail_account(gmail_account_id, 'read'))
    or (microsoft_account_id is not null and app_private.can_use_microsoft_account(microsoft_account_id, 'read'))
  )
);
create policy "permitted users manage mail threads" on public.mail_threads
for all to authenticated
using (
  case
    when project_id is not null then app_private.can_write_project(project_id)
    when gmail_account_id is not null then app_private.can_use_gmail_account(gmail_account_id, 'draft')
    else app_private.can_use_microsoft_account(microsoft_account_id, 'draft')
  end
)
with check (
  case
    when project_id is not null then app_private.can_write_project(project_id)
    when gmail_account_id is not null then app_private.can_use_gmail_account(gmail_account_id, 'draft')
    else app_private.can_use_microsoft_account(microsoft_account_id, 'draft')
  end
);

drop policy if exists "permitted users view mail messages" on public.mail_messages;
create policy "permitted users view mail messages" on public.mail_messages
for select to authenticated using (
  exists (
    select 1 from public.mail_threads thread
    where thread.id = thread_id
      and (
        thread.project_id is not null
        or (thread.gmail_account_id is not null and app_private.can_use_gmail_account(thread.gmail_account_id, 'read'))
        or (thread.microsoft_account_id is not null and app_private.can_use_microsoft_account(thread.microsoft_account_id, 'read'))
      )
  )
);

-- OAuth nonce values are HMACs only, expire quickly, and are consumed atomically.
create table app_private.microsoft_oauth_nonces (
  nonce_hash text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  expires_at timestamptz not null default (pg_catalog.clock_timestamp() + interval '10 minutes'),
  consumed_at timestamptz,
  constraint microsoft_oauth_nonce_hash_present check (pg_catalog.length(nonce_hash) between 32 and 256),
  constraint microsoft_oauth_nonce_expiry_valid check (expires_at > created_at)
);
create index microsoft_oauth_nonces_expiry_idx
  on app_private.microsoft_oauth_nonces (expires_at) where consumed_at is null;
create index microsoft_oauth_nonces_workspace_idx
  on app_private.microsoft_oauth_nonces (workspace_id);
create index microsoft_oauth_nonces_user_idx
  on app_private.microsoft_oauth_nonces (user_id);
revoke all on app_private.microsoft_oauth_nonces from public, anon, authenticated;

create or replace function public.create_microsoft_oauth_nonce(
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
    select 1 from public.workspace_members membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = target_user_id
      and membership.status = 'active'
  ) then
    raise exception 'inactive workspace membership' using errcode = '42501';
  end if;
  insert into app_private.microsoft_oauth_nonces (nonce_hash, workspace_id, user_id)
  values (target_nonce_hash, target_workspace_id, target_user_id);
end;
$function$;

create or replace function public.consume_microsoft_oauth_nonce(
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
  update app_private.microsoft_oauth_nonces
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

revoke all on function public.create_microsoft_oauth_nonce(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.consume_microsoft_oauth_nonce(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_microsoft_oauth_nonce(text, uuid, uuid) to service_role;
grant execute on function public.consume_microsoft_oauth_nonce(text, uuid, uuid) to service_role;

grant select, insert, update, delete on public.microsoft_account_permissions to authenticated;
grant insert, update, delete on public.microsoft_accounts to authenticated;
revoke select on public.microsoft_accounts from authenticated;
grant select (
  id, workspace_id, owner_user_id, email, display_name, graph_user_id,
  expires_at, sync_status, initial_sync_after, last_synced_at, active,
  created_at, updated_at
) on public.microsoft_accounts to authenticated;
