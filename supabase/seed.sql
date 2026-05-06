insert into campaigns (
  id,
  slug,
  name,
  organization,
  description,
  value_proposition,
  status,
  starts_on
) values (
  '00000000-0000-4000-8000-000000000001',
  'pastoral-invierno-2026',
  'Pastoral UC Invierno 2026',
  'Pastoral UC / Trabajo País',
  'Campaña de prospección para conseguir auspicios y donaciones de empresas alineadas con impacto social, comunidad, educación y territorio.',
  'Invitación a apoyar un proyecto social universitario con presencia territorial y voluntariado de estudiantes.',
  'active',
  '2026-06-01'
) on conflict do nothing;

insert into campaigns (
  id,
  slug,
  name,
  organization,
  description,
  value_proposition,
  status,
  starts_on
) values (
  '00000000-0000-4000-8000-000000000002',
  'caa-eventos-2026',
  'Eventos Centro de Alumnos 2026',
  'Centro de Alumnos',
  'Campaña reutilizable para prospectar marcas y auspicios para eventos universitarios.',
  'Auspicios para actividades estudiantiles con alta visibilidad y segmentación universitaria.',
  'draft',
  '2026-08-01'
) on conflict do nothing;

insert into sender_accounts (
  id,
  email,
  display_name,
  organization,
  account_type,
  signature,
  status,
  daily_limit,
  notes
) values (
  '00000000-0000-4000-8000-000000000101',
  'josemigueloaguado@estudiante.uc.cl',
  'Equipo Pastoral UC',
  'Pastoral UC / Trabajo País',
  'outlook',
  E'Equipo Pastoral UC\nTrabajo País',
  'active',
  15,
  'Cuenta Microsoft 365 UC. El conector Outlook de ChatGPT requiere admin consent; v1 usa envío manual asistido.'
) on conflict do nothing;

insert into sender_accounts (
  id,
  email,
  display_name,
  organization,
  account_type,
  signature,
  status,
  daily_limit,
  notes
) values (
  '00000000-0000-4000-8000-000000000102',
  'sawitting@miuandes.cl',
  'Recursos Financieros CAA',
  'Centro de Alumnos',
  'gmail',
  E'Jefatura de Recursos Financieros\nCentro de Alumnos',
  'active',
  15,
  'Cuenta Gmail/U Andes usada para primeros contactos y seguimiento automatizable.'
) on conflict (email) do update
set
  display_name = excluded.display_name,
  organization = excluded.organization,
  account_type = excluded.account_type,
  signature = excluded.signature,
  status = excluded.status,
  daily_limit = excluded.daily_limit,
  notes = excluded.notes,
  updated_at = now();

update campaign_sender_accounts
set is_default = false
where campaign_id = '00000000-0000-4000-8000-000000000001';

insert into campaign_sender_accounts (
  campaign_id,
  sender_account_id,
  priority,
  campaign_daily_limit,
  is_default
) values (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000102',
  1,
  15,
  true
) on conflict (campaign_id, sender_account_id) do update
set
  priority = excluded.priority,
  campaign_daily_limit = excluded.campaign_daily_limit,
  is_default = excluded.is_default;

update campaign_sender_accounts
set is_default = false, priority = 2
where campaign_id = '00000000-0000-4000-8000-000000000001'
  and sender_account_id = '00000000-0000-4000-8000-000000000101';

insert into campaign_sender_accounts (
  campaign_id,
  sender_account_id,
  priority,
  campaign_daily_limit,
  is_default
) values (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000101',
  2,
  15,
  false
) on conflict (campaign_id, sender_account_id) do update
set
  priority = excluded.priority,
  campaign_daily_limit = excluded.campaign_daily_limit,
  is_default = excluded.is_default;

insert into campaign_sender_accounts (
  campaign_id,
  sender_account_id,
  priority,
  campaign_daily_limit,
  is_default
) values (
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000102',
  1,
  15,
  true
) on conflict (campaign_id, sender_account_id) do update
set
  priority = excluded.priority,
  campaign_daily_limit = excluded.campaign_daily_limit,
  is_default = excluded.is_default;

insert into companies (
  id,
  canonical_name,
  normalized_name,
  domain,
  website,
  industry,
  region,
  global_notes
) values
  ('00000000-0000-4000-8000-000000001001', 'BancoEstado', 'bancoestado', 'bancoestado.cl', 'https://www.bancoestado.cl', 'Servicios financieros', 'RM', 'Historial de apoyo a iniciativas de inclusión y presencia territorial.'),
  ('00000000-0000-4000-8000-000000001002', 'Colun', 'colun', 'colun.cl', 'https://www.colun.cl', 'Alimentos', 'Los Ríos', 'Buen fit territorial y reputacional para iniciativas sociales.'),
  ('00000000-0000-4000-8000-000000001003', 'Cencosud', 'cencosud', 'cencosud.com', 'https://www.cencosud.com', 'Retail', 'RM', 'Interés potencial por voluntariado corporativo y comunidad.'),
  ('00000000-0000-4000-8000-000000001004', 'Sodimac', 'sodimac', 'sodimac.cl', 'https://www.sodimac.cl', 'Retail construcción', 'RM', 'Potencial para materiales, herramientas o aportes en especie.'),
  ('00000000-0000-4000-8000-000000001005', 'NotCo', 'notco', 'notco.com', 'https://www.notco.com', 'Alimentos / consumo', 'RM', 'Buen fit para eventos universitarios y activaciones de marca.')
on conflict do nothing;

insert into contacts (
  id,
  company_id,
  full_name,
  normalized_name,
  role,
  category,
  email,
  source,
  confidence,
  verification_status,
  verified_at,
  bounce_count,
  is_decision_maker,
  global_notes
) values
  ('00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000001001', 'Beatriz Rojas', 'beatriz rojas', 'Subgerenta de Sostenibilidad', 'Sostenibilidad', 'beatriz.rojas@bancoestado.cl', 'Notion histórico', 0.82, 'unverified', null, 0, false, 'Decisora marcada en base antigua; falta respuesta real.'),
  ('00000000-0000-4000-8000-000000002002', '00000000-0000-4000-8000-000000001002', 'Martín Fernández', 'martin fernandez', 'Jefe de Comunicaciones Corporativas', 'Comunicaciones', 'martin.fernandez@colun.cl', 'Google Sheets', 0.74, 'unverified', null, 0, false, 'Buen cargo para derivación interna; falta respuesta real.'),
  ('00000000-0000-4000-8000-000000002003', '00000000-0000-4000-8000-000000001003', 'Paula Herrera', 'paula herrera', 'Gerenta de Asuntos Corporativos', 'Asuntos corporativos', 'paula.herrera@cencosud.com', 'Excel eventos 2025', 0.88, 'verified', '2026-05-03T11:30:00Z', 0, true, 'Pidió más información en una campaña anterior.'),
  ('00000000-0000-4000-8000-000000002004', '00000000-0000-4000-8000-000000001004', 'Ignacio Valdés', 'ignacio valdes', 'Especialista de Comunidad', 'Comunidad', 'ignacio.valdes@sodimac.cl', 'Investigación web', 0.68, 'verified', '2026-05-04T15:30:00Z', 0, false, 'Contacto operativo para donaciones en especie.'),
  ('00000000-0000-4000-8000-000000002005', '00000000-0000-4000-8000-000000001005', 'Francisca Morales', 'francisca morales', 'Brand Partnerships Manager', 'Marketing', 'francisca.morales@notco.com', 'Excel eventos 2025', 0.71, 'unverified', null, 0, false, 'Contacto más orientado a eventos y activaciones universitarias; falta respuesta real.')
on conflict do nothing;

insert into campaign_contacts (
  id,
  campaign_id,
  company_id,
  contact_id,
  fit_score,
  priority_score,
  status,
  selected_contact_reason,
  campaign_notes
) values
  ('00000000-0000-4000-8000-000000003001', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001001', '00000000-0000-4000-8000-000000002001', 91, 45, 'draft_ready', 'Posible sostenibilidad con buen fit territorial; contacto no verificado.', 'Prioridad sube solo si responde.'),
  ('00000000-0000-4000-8000-000000003002', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001002', '00000000-0000-4000-8000-000000002002', 87, 45, 'approved_to_send', 'Comunicaciones corporativas puede derivar internamente; contacto no verificado.', 'Aprobado para envío, pero no verificado hasta respuesta.'),
  ('00000000-0000-4000-8000-000000003003', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001003', '00000000-0000-4000-8000-000000002003', 82, 92, 'replied', 'Asuntos corporativos y experiencia previa.', 'Pidió más información.'),
  ('00000000-0000-4000-8000-000000003004', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001004', '00000000-0000-4000-8000-000000002004', 79, 64, 'followup_due', 'Contacto operativo para donaciones en especie.', 'Follow-up pendiente.'),
  ('00000000-0000-4000-8000-000000003005', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000001003', '00000000-0000-4000-8000-000000002003', 78, 92, 'qualified', 'Puede servir para eventos y marcas de consumo.', 'Revisar para eventos.'),
  ('00000000-0000-4000-8000-000000003006', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000001005', '00000000-0000-4000-8000-000000002005', 76, 45, 'draft_ready', 'Rol de partnerships para activaciones universitarias; contacto no verificado.', 'Borrador listo para revisión.')
on conflict do nothing;

insert into messages (
  id,
  campaign_id,
  company_id,
  contact_id,
  sender_account_id,
  kind,
  status,
  subject_draft,
  body_draft,
  subject_final,
  body_final,
  sent_at,
  received_at,
  reply_classification,
  future_note
) values
  (
    '00000000-0000-4000-8000-000000004001',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000001001',
    '00000000-0000-4000-8000-000000002001',
    '00000000-0000-4000-8000-000000000102',
    'outbound_initial',
    'needs_review',
    'Apoyo para Pastoral UC Invierno 2026',
    E'Hola Beatriz,\n\nSoy parte del equipo de Pastoral UC / Trabajo País. Estamos preparando la campaña de invierno 2026 y creemos que BancoEstado podría tener un buen calce por su trabajo territorial y foco social.\n\nNos gustaría explorar si existe espacio para una donación, auspicio o aporte en especie para apoyar el trabajo con comunidades durante el invierno.\n\nSi te hace sentido, ¿podríamos enviarte una breve propuesta esta semana?\n\nEquipo Pastoral UC\nTrabajo País\n\nSi no corresponde o prefieren que no volvamos a escribir, nos avisan y los sacamos de la lista.',
    null,
    null,
    null,
    null,
    null,
    null
  ),
  (
    '00000000-0000-4000-8000-000000004002',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000001002',
    '00000000-0000-4000-8000-000000002002',
    '00000000-0000-4000-8000-000000000102',
    'outbound_initial',
    'approved',
    'Trabajo País: posible apoyo de Colun',
    E'Hola Martín,\n\nTe escribimos desde Pastoral UC / Trabajo País. Estamos levantando apoyos para la campaña de invierno 2026 y Colun nos parece un posible aliado por su vínculo con regiones y comunidades.\n\n¿Nos podrías orientar con quién revisar una propuesta breve de apoyo o donación?\n\nEquipo Pastoral UC\nTrabajo País\n\nSi no corresponde o prefieren que no volvamos a escribir, nos avisan y los sacamos de la lista.',
    null,
    null,
    null,
    null,
    null,
    null
  ),
  (
    '00000000-0000-4000-8000-000000004003',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000001005',
    '00000000-0000-4000-8000-000000002005',
    '00000000-0000-4000-8000-000000000102',
    'outbound_initial',
    'needs_review',
    'Auspicio para eventos estudiantiles 2026',
    E'Hola Francisca,\n\nTe escribo desde el equipo de recursos financieros del centro de alumnos. Estamos preparando eventos estudiantiles para 2026 y creemos que NotCo podría calzar bien por su foco de marca joven y activaciones universitarias.\n\n¿Te haría sentido que te enviemos una propuesta breve de auspicio o colaboración?\n\nCentro de Alumnos\n\nSi no corresponde o prefieren que no volvamos a escribir, nos avisan y los sacamos de la lista.',
    null,
    null,
    null,
    null,
    null,
    null
  ),
  (
    '00000000-0000-4000-8000-000000004004',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000001004',
    '00000000-0000-4000-8000-000000002004',
    '00000000-0000-4000-8000-000000000102',
    'inbound_reply',
    'needs_review',
    null,
    E'Hola, gracias por escribir. ¿Tienen una presentación corta y monto objetivo? Lo puedo revisar internamente.',
    null,
    E'Hola Ignacio,\n\nMuchas gracias por responder. Sí, tenemos una presentación breve y un resumen del monto objetivo. Te la comparto por acá y quedo atento a cualquier formato que necesiten para revisión interna.\n\nEquipo Pastoral UC',
    null,
    now(),
    'needs_info',
    'Sodimac pidió presentación y monto objetivo; útil para futuras campañas con aportes en especie.'
  )
on conflict do nothing;

insert into import_batches (
  id,
  campaign_id,
  source_name,
  source_type,
  status,
  row_count,
  applied_count,
  duplicate_count,
  error_count
) values
  ('00000000-0000-4000-8000-000000005001', '00000000-0000-4000-8000-000000000001', 'Contactos Notion Pastoral 2025', 'notion', 'needs_review', 84, 61, 18, 5),
  ('00000000-0000-4000-8000-000000005002', '00000000-0000-4000-8000-000000000002', 'Excel auspicios eventos', 'excel', 'parsed', 132, 0, 27, 3)
on conflict do nothing;
