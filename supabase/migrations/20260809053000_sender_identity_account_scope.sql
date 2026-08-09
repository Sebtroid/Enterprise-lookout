-- A sender identity may only reference an active Gmail account in the same workspace.
-- The account owner or a Gmail administrator may make that association.

create or replace function app_private.can_link_sender_identity(
  target_workspace_id uuid,
  target_account_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_account_id is not null and exists (
    select 1
    from public.gmail_accounts account
    where account.id = target_account_id
      and account.workspace_id = target_workspace_id
      and account.active
      and app_private.is_workspace_member(target_workspace_id)
      and app_private.can_use_gmail_account(account.id, 'manage')
  );
$$;

revoke all on function app_private.can_link_sender_identity(uuid, uuid) from public;
grant execute on function app_private.can_link_sender_identity(uuid, uuid) to authenticated;

drop policy if exists "users create own identities" on public.sender_identities;
drop policy if exists "users manage own identities" on public.sender_identities;

create policy "users create own identities" on public.sender_identities for insert to authenticated
with check (
  user_id = (select auth.uid())
  and app_private.is_workspace_member(workspace_id)
  and (
    gmail_account_id is null
    or app_private.can_link_sender_identity(workspace_id, gmail_account_id)
  )
);

create policy "users manage own identities" on public.sender_identities for update to authenticated
using (
  user_id = (select auth.uid())
  or app_private.is_workspace_owner(workspace_id)
)
with check (
  (
    user_id = (select auth.uid())
    or app_private.is_workspace_owner(workspace_id)
  )
  and app_private.is_workspace_member(workspace_id)
  and (
    gmail_account_id is null
    or app_private.can_link_sender_identity(workspace_id, gmail_account_id)
  )
);
