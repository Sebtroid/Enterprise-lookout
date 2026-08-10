-- Prevent a project-scoped V2 row from naming a workspace other than its project.
-- Nullable project references remain valid when project_id is null.

alter table public.projects
  add constraint projects_workspace_id_id_key unique (workspace_id, id);

alter table public.project_companies
  add constraint project_companies_workspace_project_fk
  foreign key (workspace_id, project_id)
  references public.projects (workspace_id, id);

alter table public.evidence_sources
  add constraint evidence_sources_workspace_project_fk
  foreign key (workspace_id, project_id)
  references public.projects (workspace_id, id);

alter table public.fact_revisions
  add constraint fact_revisions_workspace_project_fk
  foreign key (workspace_id, project_id)
  references public.projects (workspace_id, id);

alter table public.activity_events
  add constraint activity_events_workspace_project_fk
  foreign key (workspace_id, project_id)
  references public.projects (workspace_id, id);

alter table public.research_briefs
  add constraint research_briefs_workspace_project_fk
  foreign key (workspace_id, project_id)
  references public.projects (workspace_id, id);

alter table public.research_candidates
  add constraint research_candidates_workspace_project_fk
  foreign key (workspace_id, project_id)
  references public.projects (workspace_id, id);

alter table public.research_reports
  add constraint research_reports_workspace_project_fk
  foreign key (workspace_id, project_id)
  references public.projects (workspace_id, id);

alter table public.ai_jobs
  add constraint ai_jobs_workspace_project_fk
  foreign key (workspace_id, project_id)
  references public.projects (workspace_id, id);

alter table public.mail_threads
  add constraint mail_threads_workspace_project_fk
  foreign key (workspace_id, project_id)
  references public.projects (workspace_id, id);

alter table public.finance_goals
  add constraint finance_goals_workspace_project_fk
  foreign key (workspace_id, project_id)
  references public.projects (workspace_id, id);

alter table public.contributions
  add constraint contributions_workspace_project_fk
  foreign key (workspace_id, project_id)
  references public.projects (workspace_id, id);

alter table public.expenses
  add constraint expenses_workspace_project_fk
  foreign key (workspace_id, project_id)
  references public.projects (workspace_id, id);

alter table public.followup_sequences
  add constraint followup_sequences_workspace_project_fk
  foreign key (workspace_id, project_id)
  references public.projects (workspace_id, id);

alter table public.project_tasks
  add constraint project_tasks_workspace_project_fk
  foreign key (workspace_id, project_id)
  references public.projects (workspace_id, id);

alter table public.meetings
  add constraint meetings_workspace_project_fk
  foreign key (workspace_id, project_id)
  references public.projects (workspace_id, id);

alter table public.project_links
  add constraint project_links_workspace_project_fk
  foreign key (workspace_id, project_id)
  references public.projects (workspace_id, id);

alter table public.mail_drafts
  add constraint mail_drafts_workspace_project_fk
  foreign key (workspace_id, project_id)
  references public.projects (workspace_id, id);

alter table public.ai_feedback_rules
  add constraint ai_feedback_rules_workspace_project_fk
  foreign key (workspace_id, project_id)
  references public.projects (workspace_id, id);

alter table public.followup_enrollments
  add constraint followup_enrollments_workspace_project_fk
  foreign key (workspace_id, project_id)
  references public.projects (workspace_id, id);

create index if not exists project_companies_workspace_project_idx
  on public.project_companies (workspace_id, project_id);
create index if not exists evidence_sources_workspace_project_idx
  on public.evidence_sources (workspace_id, project_id) where project_id is not null;
create index if not exists fact_revisions_workspace_project_idx
  on public.fact_revisions (workspace_id, project_id) where project_id is not null;
create index if not exists activity_events_workspace_project_idx
  on public.activity_events (workspace_id, project_id) where project_id is not null;
create index if not exists research_briefs_workspace_project_idx
  on public.research_briefs (workspace_id, project_id);
create index if not exists research_candidates_workspace_project_idx
  on public.research_candidates (workspace_id, project_id);
create index if not exists research_reports_workspace_project_idx
  on public.research_reports (workspace_id, project_id);
create index if not exists ai_jobs_workspace_project_idx
  on public.ai_jobs (workspace_id, project_id) where project_id is not null;
create index if not exists mail_threads_workspace_project_idx
  on public.mail_threads (workspace_id, project_id) where project_id is not null;
create index if not exists finance_goals_workspace_project_idx
  on public.finance_goals (workspace_id, project_id);
create index if not exists contributions_workspace_project_idx
  on public.contributions (workspace_id, project_id);
create index if not exists expenses_workspace_project_idx
  on public.expenses (workspace_id, project_id);
create index if not exists followup_sequences_workspace_project_idx
  on public.followup_sequences (workspace_id, project_id);
create index if not exists project_tasks_workspace_project_idx
  on public.project_tasks (workspace_id, project_id);
create index if not exists meetings_workspace_project_idx
  on public.meetings (workspace_id, project_id) where project_id is not null;
create index if not exists project_links_workspace_project_idx
  on public.project_links (workspace_id, project_id);
create index if not exists mail_drafts_workspace_project_idx
  on public.mail_drafts (workspace_id, project_id) where project_id is not null;
create index if not exists ai_feedback_rules_workspace_project_idx
  on public.ai_feedback_rules (workspace_id, project_id) where project_id is not null;
create index if not exists followup_enrollments_workspace_project_idx
  on public.followup_enrollments (workspace_id, project_id);
