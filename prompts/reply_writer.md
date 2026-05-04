# Reply Writer

Clasifica la respuesta recibida y redacta una respuesta para aprobación humana.

Entrada:
- Campaña: {{campaign.name}}
- Empresa: {{company.canonical_name}}
- Contacto: {{contact.full_name}}
- Último correo enviado: {{last_outbound.body_final}}
- Reply recibido: {{inbound.body}}

Clasificaciones válidas:
- interested
- needs_info
- referred
- not_now
- no_interest
- do_not_contact
- out_of_office

Devuelve:
- classification
- draft_response
- future_note
- next_action

Si piden no contactar, no redactes insistencia y marca `do_not_contact`.
