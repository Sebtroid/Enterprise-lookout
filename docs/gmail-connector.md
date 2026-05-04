# Mail Connectors

## Decisión V1 Actual

Pastoral UC usa `josemigueloaguado@estudiante.uc.cl`, que pertenece a Microsoft
365 UC. El tenant UC exige aprobación de administrador para que ChatGPT tenga
permisos de lectura/escritura/envío.

Por eso, V1 usa:

- **Outlook manual asistido** para Pastoral UC.
- **Gmail plugin de Codex** para cuentas Gmail futuras.

Outlook manual asistido significa que el dashboard abre Outlook Web con
destinatario, asunto y cuerpo precargados. El usuario revisa y aprieta
“Enviar” dentro de Outlook.

## Gmail Plugin

- Buscar replies.
- Crear drafts.
- Enviar drafts aprobados.
- Mantener el costo cerca de cero usando Codex Automations.

## Por Qué No API Propia Todavía

Gmail API/Microsoft Graph propios sirven mejor para multi-remitente real, pero
meten más carga:

- Proyecto Google Cloud o Azure.
- OAuth consent screen.
- Scopes sensibles.
- Refresh tokens cifrados.
- Reautorización por cuenta.
- Más superficie de seguridad.

Para v1, esa complejidad no aporta si UC bloquea el consentimiento admin y
necesitamos operar con presupuesto mínimo.

## Regla Operativa

El dashboard sigue siendo la fuente de verdad:

- `messages.status = approved` habilita envío.
- `messages.sender_account_id` define qué remitente debe usarse.
- `sender_accounts.email` debe coincidir con la cuenta del proveedor.
- `sender_accounts.account_type` define si se usa Outlook, Gmail, SMTP o manual.
- Después de enviar, el job guarda `gmail_message_id`, `gmail_thread_id` y
  `sent_at`.

Si el remitente en DB no coincide con la cuenta conectada, el job no envía.

## Cuándo Migrar A Gmail API Propia

Migrar cuando necesiten cualquiera de estos casos:

- Enviar desde varias cuentas al mismo tiempo.
- Que el dashboard conecte/desconecte cuentas sin pasar por Codex.
- Mostrar drafts reales de Gmail dentro del dashboard.
- Historial Gmail/Outlook sincronizado continuamente sin depender de una sesión
  Codex.
