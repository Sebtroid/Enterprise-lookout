# Setup: Enterprise Lookout Custom GPT

This Custom GPT lets Sebastian work from ChatGPT while Enterprise Lookout remains the source of truth.

## 1. Create GPT

Open:

https://chatgpt.com/gpts/editor

Create a new GPT:

- Name: `Enterprise Lookout`
- Description: `Operates Sebastian's sponsor prospecting workspace: tasks, company research, contacts, mail drafts and feedback memory.`

Paste the contents of:

- `docs/gpt/enterprise-lookout-gpt-instructions.md`

Add this file as knowledge:

- `docs/gpt/enterprise-lookout-skills.md`

## 2. Configure Actions

In the Actions section, import the OpenAPI schema from:

```text
https://enterprise-lookout.vercel.app/api/gpt/actions/openapi.json
```

Authentication:

- Type: API Key
- Auth Type: Bearer
- Header: `Authorization`
- Value: the production `AGENT_API_TOKEN` from Vercel

## 3. Test Actions

Ask the GPT:

```text
Lista las campañas disponibles.
```

Expected:

- It calls `listCampaigns`.
- It returns campaigns from Enterprise Lookout.

Then ask:

```text
Crea una tarea de prueba en Día del Ingeniero que diga "prueba custom GPT" y reclámala.
```

Expected:

- It calls `createGptJob`.
- It calls `claimNextGptJobs`.
- The task appears in the Dom/Tareas dashboard.

## 4. Operating Model

Dom, Custom GPT and Codex can all use the same task surface. The app remains the source of truth.

Recommended worker identifiers:

- Custom GPT: `custom-gpt:manual-session`
- Codex mail worker: `codex:mails`
- Codex company worker: `codex:companies`
- Dom fallback: `dom`

## 5. Important Limits

- This avoids OpenAI API billing because the work happens through ChatGPT/GPT Actions, not the OpenAI API.
- A Custom GPT does not run silently in the background. It works when a ChatGPT session is active.
- For unattended background processing, use Codex automations over the same queue.
- Keep all persistent rules in Supabase through `createMemoryRule`; do not rely on the Custom GPT remembering prior chats.
