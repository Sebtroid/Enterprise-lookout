create table if not exists pastoral_sheet_reservations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  company_id uuid references companies(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  message_id uuid not null references messages(id) on delete cascade,
  contact_name text not null,
  contact_email citext not null,
  contact_domain text,
  sender_email citext not null,
  sheet_id text not null,
  sheet_range text not null,
  status text not null default 'reserved' check (
    status in ('reserved', 'appended', 'verified', 'sent', 'failed')
  ),
  detail jsonb not null default '{}',
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (message_id)
);

create unique index if not exists pastoral_sheet_reservations_active_email_unique
  on pastoral_sheet_reservations (campaign_id, contact_email)
  where status in ('reserved', 'appended', 'verified', 'sent');

create unique index if not exists pastoral_sheet_reservations_active_domain_unique
  on pastoral_sheet_reservations (campaign_id, contact_domain)
  where contact_domain is not null
    and status in ('reserved', 'appended', 'verified', 'sent');

create index if not exists pastoral_sheet_reservations_status_idx
  on pastoral_sheet_reservations (campaign_id, status, updated_at desc);

alter table pastoral_sheet_reservations enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pastoral_sheet_reservations'
      and policyname = 'authenticated workspace access'
  ) then
    create policy "authenticated workspace access"
      on pastoral_sheet_reservations
      for all
      using (auth.role() = 'authenticated')
      with check (auth.role() = 'authenticated');
  end if;
end $$;

grant select, insert, update, delete on pastoral_sheet_reservations to authenticated;
