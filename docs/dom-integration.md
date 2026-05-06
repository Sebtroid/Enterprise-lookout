# Dom Integration

Enterprise Lookout talks to Dom through HTTP. Telegram is only Dom's own surface.

## Environment

Required server variables:

- `DOM_API_TOKEN`: shared bearer token between Enterprise Lookout and Dom.
- `DOM_WEBHOOK_URL`: Dom webhook endpoint, default `https://dom-assistant.vercel.app/api/webhook/enterprise-lookout`.
- `DOM_CHAT_URL`: Dom campaign chat endpoint, default `https://dom-assistant.vercel.app/api/chat/enterprise-lookout`.
- `DOM_USER_EMAIL`: user identity sent in payloads, default `sawitting@miuandes.cl`.

## Outbound Events

The app posts to Dom when:

- A company is classified as `sirve` or `investigar`.
- A mail is approved.
- A replacement draft is generated after rejection feedback.
- A Gmail reply is synced.
- The user creates an explicit Dom task.
- The user sends a campaign chat message.

Every payload includes the campaign context so Dom can work without asking the user to repeat it.

## Inbound Endpoints

Dom can call these app endpoints with `Authorization: Bearer <DOM_API_TOKEN>`:

- `POST /api/dom/webhook`: callbacks for webhook events, task creation, task updates, draft creation.
- `POST /api/dom/chat`: chat callbacks for a campaign thread.

Supported response/action shape:

```json
{
  "ok": true,
  "message": "Resultado para guardar en el chat.",
  "tasks_created": [
    {"id": "external-id", "description": "Investigar contactos", "status": "pending"}
  ],
  "actions": [
    {"type": "update_task", "task_id": "uuid", "status": "completed", "result": "..."},
    {"type": "create_task", "description": "Redactar mail", "status": "pending"},
    {
      "type": "create_draft",
      "company_id": "uuid",
      "contact_id": "uuid opcional",
      "subject": "Asunto",
      "body": "Cuerpo"
    }
  ]
}
```

`create_draft` leaves the mail as `needs_review`; it never sends automatically.
