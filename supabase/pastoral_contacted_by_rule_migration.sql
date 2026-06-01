insert into ai_memory_rules (
  scope,
  rule_type,
  rule_text,
  campaign_id,
  source,
  confidence,
  created_by
)
select
  'campaign',
  'pastoral_sheets',
  'Para Pastoral UC, todo contacto registrado en el Sheets compartido debe quedar con "Contactado por" = "José Miguel Olavarría", aunque el mail se envíe desde otra cuenta.',
  campaigns.id,
  'codex_rule',
  0.98,
  'codex'
from campaigns
where campaigns.slug = 'pastoral-invierno-2026'
  and not exists (
    select 1
    from ai_memory_rules existing
    where existing.campaign_id = campaigns.id
      and existing.rule_type = 'pastoral_sheets'
      and existing.rule_text like '%José Miguel Olavarría%'
      and existing.active = true
  );
