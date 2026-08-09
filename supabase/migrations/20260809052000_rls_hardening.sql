-- Replace broad workspace-member mutation policies with project-aware rules.

do $$
declare
  table_name text;
  project_tables text[] := array[
    'project_companies', 'research_briefs', 'research_candidates',
    'research_reports', 'finance_goals', 'contributions', 'expenses',
    'followup_sequences'
  ];
begin
  foreach table_name in array project_tables loop
    execute format('drop policy if exists "workspace members insert" on public.%I', table_name);
    execute format('drop policy if exists "workspace members update" on public.%I', table_name);
    execute format('drop policy if exists "workspace members delete" on public.%I', table_name);
    execute format(
      'create policy "project editors insert" on public.%I for insert to authenticated with check (app_private.can_write_project(project_id))',
      table_name
    );
    execute format(
      'create policy "project editors update" on public.%I for update to authenticated using (app_private.can_write_project(project_id)) with check (app_private.can_write_project(project_id))',
      table_name
    );
    execute format(
      'create policy "project editors delete" on public.%I for delete to authenticated using (app_private.can_write_project(project_id))',
      table_name
    );
  end loop;
end $$;

drop policy if exists "workspace members insert" on public.followup_steps;
drop policy if exists "workspace members update" on public.followup_steps;
drop policy if exists "workspace members delete" on public.followup_steps;
create policy "project editors insert followup steps" on public.followup_steps for insert to authenticated
with check (exists (select 1 from public.followup_sequences s where s.id = sequence_id and app_private.can_write_project(s.project_id)));
create policy "project editors update followup steps" on public.followup_steps for update to authenticated
using (exists (select 1 from public.followup_sequences s where s.id = sequence_id and app_private.can_write_project(s.project_id)))
with check (exists (select 1 from public.followup_sequences s where s.id = sequence_id and app_private.can_write_project(s.project_id)));
create policy "project editors delete followup steps" on public.followup_steps for delete to authenticated
using (exists (select 1 from public.followup_sequences s where s.id = sequence_id and app_private.can_write_project(s.project_id)));

drop policy if exists "workspace members insert" on public.ai_jobs;
drop policy if exists "workspace members update" on public.ai_jobs;
drop policy if exists "workspace members delete" on public.ai_jobs;
create policy "project editors create jobs" on public.ai_jobs for insert to authenticated
with check (
  requested_by = (select auth.uid())
  and ((project_id is not null and app_private.can_write_project(project_id)) or (project_id is null and app_private.is_workspace_owner(workspace_id)))
);
create policy "project editors approve jobs" on public.ai_jobs for update to authenticated
using ((project_id is not null and app_private.can_write_project(project_id)) or (project_id is null and app_private.is_workspace_owner(workspace_id)))
with check ((project_id is not null and app_private.can_write_project(project_id)) or (project_id is null and app_private.is_workspace_owner(workspace_id)));

-- Evidence and revisions are append-only. Verified history cannot be overwritten.
drop policy if exists "workspace members update" on public.evidence_sources;
drop policy if exists "workspace members delete" on public.evidence_sources;
drop policy if exists "workspace members update" on public.fact_revisions;
drop policy if exists "workspace members delete" on public.fact_revisions;
revoke update, delete on public.evidence_sources, public.fact_revisions from authenticated;

-- Activity and usage ledgers are immutable from the browser.
drop policy if exists "workspace members insert" on public.activity_events;
drop policy if exists "workspace members update" on public.activity_events;
drop policy if exists "workspace members delete" on public.activity_events;
drop policy if exists "workspace members insert" on public.ai_usage_ledger;
drop policy if exists "workspace members update" on public.ai_usage_ledger;
drop policy if exists "workspace members delete" on public.ai_usage_ledger;
revoke insert, update, delete on public.activity_events, public.ai_usage_ledger from authenticated;

-- Users manage only their own sender identities; owners can administer the workspace.
drop policy if exists "workspace members insert" on public.sender_identities;
drop policy if exists "workspace members update" on public.sender_identities;
drop policy if exists "workspace members delete" on public.sender_identities;
create policy "users create own identities" on public.sender_identities for insert to authenticated
with check (user_id = (select auth.uid()) and app_private.is_workspace_member(workspace_id));
create policy "users manage own identities" on public.sender_identities for update to authenticated
using (user_id = (select auth.uid()) or app_private.is_workspace_owner(workspace_id))
with check (user_id = (select auth.uid()) or app_private.is_workspace_owner(workspace_id));
create policy "users delete own identities" on public.sender_identities for delete to authenticated
using (user_id = (select auth.uid()) or app_private.is_workspace_owner(workspace_id));

-- Invite-only means only workspace owners can mutate invitations.
drop policy if exists "workspace members insert" on public.workspace_invitations;
drop policy if exists "workspace members update" on public.workspace_invitations;
drop policy if exists "workspace members delete" on public.workspace_invitations;
create policy "owners create invitations" on public.workspace_invitations for insert to authenticated
with check (app_private.is_workspace_owner(workspace_id));
create policy "owners update invitations" on public.workspace_invitations for update to authenticated
using (app_private.is_workspace_owner(workspace_id)) with check (app_private.is_workspace_owner(workspace_id));
create policy "owners delete invitations" on public.workspace_invitations for delete to authenticated
using (app_private.is_workspace_owner(workspace_id));

