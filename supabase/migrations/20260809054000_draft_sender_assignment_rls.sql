-- Direct draft mutations must not attach an identity that is unusable for sending.
-- Keep the authorization decision bound to the authenticated caller, not route code.

create or replace function app_private.can_assign_draft_sender(
  target_workspace_id uuid,
  target_sender_identity_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_sender_identity_id is not null
    and (select auth.uid()) is not null
    and exists (
      select 1
      from public.sender_identities identity
      join public.gmail_accounts account
        on account.id = identity.gmail_account_id
      join public.gmail_account_permissions permission
        on permission.gmail_account_id = account.id
       and permission.user_id = (select auth.uid())
       and permission.active
      where identity.id = target_sender_identity_id
        and identity.workspace_id = target_workspace_id
        and identity.active
        and account.workspace_id = target_workspace_id
        and account.active
        and permission.can_draft
        and permission.can_send
        and app_private.is_workspace_member(target_workspace_id)
    );
$$;

revoke all on function app_private.can_assign_draft_sender(uuid, uuid) from public;
grant execute on function app_private.can_assign_draft_sender(uuid, uuid) to authenticated;

drop policy if exists "project editors manage drafts" on public.mail_drafts;

create policy "project editors insert drafts" on public.mail_drafts for insert to authenticated
with check (
  project_id is not null
  and app_private.can_write_project(project_id)
  and (
    sender_identity_id is null
    or app_private.can_assign_draft_sender(workspace_id, sender_identity_id)
  )
);

create policy "project editors update drafts" on public.mail_drafts for update to authenticated
using (
  project_id is not null
  and app_private.can_write_project(project_id)
)
with check (
  project_id is not null
  and app_private.can_write_project(project_id)
  and (
    sender_identity_id is null
    or app_private.can_assign_draft_sender(workspace_id, sender_identity_id)
  )
);

create policy "project editors delete drafts" on public.mail_drafts for delete to authenticated
using (
  project_id is not null
  and app_private.can_write_project(project_id)
);
