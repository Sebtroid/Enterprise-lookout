create table if not exists ai_memory_rules (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'campaign' check (
    scope in ('global', 'campaign', 'company', 'contact', 'sender')
  ),
  rule_type text not null default 'general',
  rule_text text not null,
  campaign_id uuid references campaigns(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  sender_account_id uuid references sender_accounts(id) on delete cascade,
  source text,
  source_feedback_id uuid references outbound_feedback(id) on delete set null,
  confidence numeric(4, 3) not null default 0.8 check (
    confidence >= 0 and confidence <= 1
  ),
  active boolean not null default true,
  created_by text not null default 'custom_gpt',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_memory_rules_campaign_idx
  on ai_memory_rules (campaign_id, active, updated_at desc);

create index if not exists ai_memory_rules_scope_idx
  on ai_memory_rules (scope, rule_type, active);

alter table ai_memory_rules enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ai_memory_rules'
      and policyname = 'authenticated workspace access'
  ) then
    create policy "authenticated workspace access"
      on ai_memory_rules
      for all
      using (auth.role() = 'authenticated')
      with check (auth.role() = 'authenticated');
  end if;
end
$$;

grant select, insert, update, delete on ai_memory_rules to authenticated;
