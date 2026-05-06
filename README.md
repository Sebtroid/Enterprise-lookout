# Prospección de Auspicios

Dashboard privado para gestionar campañas de auspicios, contactos, imports, aprobación de mails y respuestas.

## Stack

- Next.js App Router + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase/Postgres schema en `supabase/schema.sql`
- Vitest para reglas de dedupe, remitentes y envío
- Prompts versionados en `prompts/`
- Reglas operativas en `rules/`

## Desarrollo

```bash
npm install
npm run dev
```

La app corre en modo demo si no hay Supabase configurado.

```bash
cp .env.example .env.local
```

Variables principales:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_DB_URL=
SUPABASE_SERVICE_ROLE_KEY=
APP_ALLOWED_EMAILS=tu@email.com,josemigueloaguado@estudiante.uc.cl
NEXT_PUBLIC_APP_MODE=demo
```

## Supabase

1. Crear proyecto en Supabase.
2. Ejecutar `supabase/schema.sql` en SQL Editor.
3. Ejecutar `supabase/seed.sql`.
4. Verificar el remitente real `josemigueloaguado@estudiante.uc.cl`.
5. Configurar auth/magic links y Vercel env vars.

También se puede aplicar desde terminal sin guardar la password:

```bash
SUPABASE_DB_URL="postgresql://postgres.<project-ref>:<password>@<pooler-host>:6543/postgres?sslmode=require" npm run supabase:apply
```

La app usa `SUPABASE_DB_URL` solo en el servidor para leer/escribir datos del
dashboard y ejecutar Server Actions. No debe llevar prefijo `NEXT_PUBLIC_`.

## Rutas

- `/campaigns`
- `/campaigns/all`
- `/campaigns/pastoral-invierno-2026`
- `/campaigns/:campaignId/imports`
- `/campaigns/:campaignId/companies`
- `/campaigns/:campaignId/contacts`
- `/campaigns/:campaignId/review/outbound`
- `/campaigns/:campaignId/review/replies`
- `/campaigns/:campaignId/pipeline`
- `/campaigns/:campaignId/settings/senders`

## Checks

```bash
npm test
npm run lint
npm run build
```
