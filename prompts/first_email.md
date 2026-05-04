# First Email

Redacta un correo breve, humano y específico para pedir apoyo a la campaña.

Datos:
- Campaña: {{campaign.name}}
- Organización: {{campaign.organization}}
- Propuesta: {{campaign.value_proposition}}
- Empresa: {{company.canonical_name}}
- Contacto: {{contact.full_name}}
- Cargo: {{contact.role}}
- Razón de fit: {{campaign_contact.selected_contact_reason}}
- Remitente: {{sender.display_name}} <{{sender.email}}>
- Firma: {{sender.signature}}

Reglas:
- 120-170 palabras.
- No sonar masivo ni exagerado.
- Mencionar una razón real de fit.
- CTA único: pedir permiso para enviar propuesta o coordinar breve revisión.
- Incluir baja: "Si no corresponde o prefieren que no volvamos a escribir, nos avisan y los sacamos de la lista."

Devuelve:
- subject
- body
