# Contact Enrichment

Empresa: {{company.canonical_name}}
Campaña: {{campaign.name}}

Busca contactos públicos relevantes para auspicios, donaciones o derivación interna. Prioriza:
- sostenibilidad
- RSE
- asuntos corporativos
- comunicaciones corporativas
- marketing
- fundación corporativa
- comunidad
- gerencia o jefaturas

Devuelve:
- name
- role
- email
- linkedin_url
- source_url
- confidence 0-1
- is_decision_maker=false salvo que ya haya respuesta verificada
- verification_status=unverified para todo contacto nuevo
- why_this_contact

No uses emails privados filtrados ni datos sin fuente razonable. Si no hay email directo, usa contacto institucional y marca baja confianza.
Un contacto por patrón de dominio o formulario público no está verificado hasta que responda. No lo marques como importante/decisor hasta una respuesta real.
