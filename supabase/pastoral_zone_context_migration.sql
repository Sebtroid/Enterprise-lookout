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
  'pastoral_zone',
  'La zona de Pastoral UC para este proyecto es Los Cardones, comuna de Ninhue, Provincia de Itata, Región de Ñuble. Coordenadas: 36°23''55.0"S 72°24''12.2"W. En mails iniciales, mencionar la comunidad y el vínculo territorial antes que la meta financiera.',
  campaigns.id,
  'codex_user_context',
  0.99,
  'codex'
from campaigns
where campaigns.slug = 'pastoral-invierno-2026'
  and not exists (
    select 1
    from ai_memory_rules existing
    where existing.campaign_id = campaigns.id
      and existing.rule_type = 'pastoral_zone'
      and existing.rule_text like '%Los Cardones%'
      and existing.active = true
  );

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
  'pastoral_research',
  'Para investigación de empresas Pastoral UC, priorizar empresas con presencia en Los Cardones, Ninhue, Provincia de Itata y Región de Ñuble. Antes de proponer contacto o mail, verificar duplicados contra el Sheets compartido por email, dominio y nombre normalizado.',
  campaigns.id,
  'codex_user_context',
  0.97,
  'codex'
from campaigns
where campaigns.slug = 'pastoral-invierno-2026'
  and not exists (
    select 1
    from ai_memory_rules existing
    where existing.campaign_id = campaigns.id
      and existing.rule_type = 'pastoral_research'
      and existing.rule_text like '%Los Cardones%'
      and existing.active = true
  );

insert into dom_tasks (
  campaign_id,
  description,
  status,
  created_by,
  context,
  progress_step,
  progress_message,
  progress_percent,
  last_progress_at
)
select
  campaigns.id,
  'Investigar empresas y contactos de la zona Los Cardones, Ninhue, Itata y Ñuble para outreach Pastoral UC.',
  'pending',
  'user',
  jsonb_build_object(
    'source',
    'codex_user_request',
    'task_type',
    'company_research',
    'priority',
    'urgent',
    'zone',
    jsonb_build_object(
      'locality',
      'Los Cardones',
      'commune',
      'Ninhue',
      'province',
      'Itata',
      'region',
      'Ñuble',
      'coordinates',
      '36°23''55.0"S 72°24''12.2"W'
    ),
    'requested_action',
    'find_local_companies_and_contacts',
    'research_scope',
    jsonb_build_array(
      'Los Cardones',
      'Ninhue',
      'Provincia de Itata',
      'Región de Ñuble',
      'empresas con operación o vínculo territorial cercano'
    ),
    'guardrails',
    jsonb_build_array(
      'No proponer empresas ya presentes en el Sheets compartido.',
      'Detectar duplicados por email, dominio corporativo y nombre normalizado.',
      'Priorizar empresas de la zona antes que empresas nacionales sin vínculo local.',
      'No enviar mails automáticamente; preparar candidatos y borradores para revisión.'
    ),
    'expected_output',
    jsonb_build_object(
      'companies',
      'lista priorizada con nombre, rubro, ubicación, web/fuente, razón para contactar y fit',
      'contacts',
      'mail o formulario usable, nombre/cargo si existe, y confianza',
      'next_step',
      'crear candidatos y/o tareas de redacción sólo si no hay duplicados'
    )
  ),
  'pending',
  'Tarea creada desde contexto de zona: investigar empresas locales sin duplicar Sheets.',
  0,
  now()
from campaigns
where campaigns.slug = 'pastoral-invierno-2026'
  and not exists (
    select 1
    from dom_tasks existing
    where existing.campaign_id = campaigns.id
      and existing.description = 'Investigar empresas y contactos de la zona Los Cardones, Ninhue, Itata y Ñuble para outreach Pastoral UC.'
      and existing.status in ('pending', 'received', 'in_progress', 'researching', 'drafting', 'reviewing')
  );
