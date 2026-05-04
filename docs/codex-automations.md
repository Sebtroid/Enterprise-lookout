# Codex Automations

Estas automatizaciones operan sobre Supabase y Gmail. En v1 deben correr en dry-run hasta que existan credenciales reales y una campaña con remitente autorizado.

## Conectores de mail

V1 soporta proveedores por `sender_accounts.account_type`.

- `outlook`: Pastoral UC con `josemigueloaguado@estudiante.uc.cl`.
- `gmail`: cuentas Gmail personales/futuras.
- `manual`: solo compose link/mailto.

Microsoft 365 UC exige aprobación admin para que ChatGPT lea/escriba/envíe mail.
Mientras eso esté bloqueado, Pastoral usa envío manual asistido: el dashboard
abre Outlook Web con destinatario, asunto y cuerpo precargados, y el usuario
manda desde Outlook.

## Jobs

- `research-companies`: diario. Busca empresas con fit alto para la campaña activa, guarda evidencia y evita duplicados.
- `enrich-contacts`: diario. Completa contactos públicos, cargo, fuente, confianza y si parece decisor.
- `draft-outbound`: diario. Redacta mails para contactos `ready_to_draft` usando el remitente default de la campaña.
- `send-approved`: horario. Envía solo mensajes `approved`, con `sender_account_id`, dentro del límite diario.
- `monitor-replies`: horario. Busca replies por Gmail, clasifica intención, guarda nota futura y crea draft de respuesta.
- `draft-followups`: diario. Propone follow-up después de 5 días hábiles sin respuesta.

## Guardrails

- Nunca enviar si contacto, empresa, dominio o email está en `suppression_list`.
- Nunca enviar si `messages.sender_account_id` está vacío.
- Nunca enviar si `messages.status` no es `approved`.
- Cada envío debe registrar `gmail_message_id`, `gmail_thread_id`, `sent_at` y un `automation_runs` finalizado.
- Si Gmail falla, dejar `messages.status = failed` y registrar error.

## Flujo `send-approved`

1. Ejecutar:

```bash
npm run outreach:queue -- approved --campaign pastoral-invierno-2026 --limit 10
```

2. Para cada mensaje, verificar `sender_account_type`.
3. Si es `outlook` y no hay admin consent de Microsoft, abrir `compose_url`,
   enviar manualmente desde Outlook y marcar enviado en el dashboard.
4. Si es `gmail`, crear/enviar con el plugin Gmail cuando la cuenta esté
   conectada.
5. Si el proveedor devuelve IDs, marcar:

```bash
npm run outreach:queue -- mark-sent --message-id <message_id> --gmail-message-id <gmail_message_id> --gmail-thread-id <gmail_thread_id>
```

6. Si el proveedor falla:

```bash
npm run outreach:queue -- mark-failed --message-id <message_id> --error "<motivo>"
```
