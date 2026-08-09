-- A draft's workspace is derived from its project and cannot be reassigned by callers.

drop policy if exists "project editors insert drafts" on public.mail_drafts;
drop policy if exists "project editors update drafts" on public.mail_drafts;

create policy "project editors insert drafts" on public.mail_drafts for insert to authenticated
with check (
  project_id is not null
  and exists (
    select 1
    from public.projects project
    where project.id = mail_drafts.project_id
      and project.workspace_id = mail_drafts.workspace_id
  )
  and app_private.can_write_project(project_id)
  and (
    sender_identity_id is null
    or app_private.can_assign_draft_sender(workspace_id, sender_identity_id)
  )
);

create policy "project editors update drafts" on public.mail_drafts for update to authenticated
using (
  project_id is not null
  and exists (
    select 1
    from public.projects project
    where project.id = mail_drafts.project_id
      and project.workspace_id = mail_drafts.workspace_id
  )
  and app_private.can_write_project(project_id)
)
with check (
  project_id is not null
  and exists (
    select 1
    from public.projects project
    where project.id = mail_drafts.project_id
      and project.workspace_id = mail_drafts.workspace_id
  )
  and app_private.can_write_project(project_id)
  and (
    sender_identity_id is null
    or app_private.can_assign_draft_sender(workspace_id, sender_identity_id)
  )
);
