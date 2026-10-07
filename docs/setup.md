# Inicio y configuración local

## Enterprise Lookout V2 en este Mac

La configuración activa usa el Supabase existente `qyructbgynzxqlqxvojf` y el
esquema privado `lookout_v2`. No necesita Docker. No ejecutar `db:migrate`,
`db:push`, `db:reset` ni `db:seed` contra esta base: la historia original incluye
el esquema `public`. Las migraciones específicas están en `evaluation/supabase/`.

Desde la carpeta del proyecto:

```sh
bash scripts/start-lookout.sh
```

Abre `http://localhost:4310`. El iniciador utiliza los binarios instalados o en
caché, verifica Node 24 y los tres builds, e inicia API, app y Dom en secuencia.
Cada proceso usa un heap máximo de 512 MB. El monitor detiene estos servicios si
su memoria residente conjunta supera 1536 MB. `Ctrl+C` detiene los tres.
El estado y los registros quedan en `.scratch/`, fuera de Git.

Para compilar una modificación, detén primero el iniciador. Ejecuta solamente el
paquete que cambió, sin Turbo ni servidores en paralelo. Los límites comprobados
para este Mac son:

| Comprobación | Heap máximo | Corte de RAM residente |
| --- | ---: | ---: |
| Tipos de API | 1024 MB | 1536 MB |
| Build de API | 512 MB | 1000 MB |
| Build completo de Next | 1280 MB | 1536 MB |
| Build de Dom | 1024 MB | 1536 MB |

`python3 scripts/low-memory.py --heap-mb 1280 --rss-mb 1536 -- comando` aplica el
límite al comando y sus procesos. Next requiere Node 24 en el PATH; Bun 1.3.12
queda disponible en la caché existente. No instalar otro runtime para iniciar la app.

## Laboratorio genérico del repositorio original

Estas instrucciones usan una base local nueva. No corresponden al Supabase activo.

```sh
cp .env.example .env        # fill DATABASE_URL, BETTER_AUTH_SECRET, ALLOWED_SIGN_IN
docker compose up -d        # Postgres, matching .env.example
bun run db:migrate && bun run db:seed
bun run dev                 # app :3000, api :3001, agent :2000
```

Prisma from the repo root: `db:generate`, `db:migrate`, `db:push`, `db:reset`,
`db:seed`, `db:studio`, `db:deploy`.

`dev` depends on `^dev:prepare`, so every start applies pending migrations and
regenerates the Prisma client before a single server boots. That is why the first
run needs `db:migrate` only for the seed that follows it. When the database and
`schema.prisma` have diverged past what `migrate deploy` can reconcile,
`dev:prepare` stops the whole run rather than starting servers against a schema
they do not match — reconcile with `db:migrate`, or `db:reset` when the divergence
is an edited migration that has already been applied.

## Google Cloud

El proyecto `vaulted-broker-510423-v7` y el cliente web
**Enterprise Lookout · acceso web** ya existen. Las credenciales completas están
en el Vault del Supabase existente. El ingreso pide solamente `openid`, `email`
y `profile`; el remitente solicita sus permisos Gmail por separado.
Las tres direcciones públicas se guardaron en ese cliente el 6 de octubre de 2026.
La siguiente lista permite revisar la configuración y realizar el primer ingreso.

1. Abre [Clientes de Enterprise Lookout](https://console.cloud.google.com/auth/clients?project=vaulted-broker-510423-v7)
   y selecciona **Enterprise Lookout · acceso web**.
2. En **Orígenes autorizados de JavaScript**, confirma
   `https://enterprise-lookout-v2.vercel.app`.
3. En **URIs de redireccionamiento autorizados**, confirma
   `https://enterprise-lookout-v2.vercel.app/api/auth/callback/google`.
4. En el mismo campo, confirma
   `https://enterprise-lookout-v2-api.vercel.app/google/mailbox/callback`.
5. Conserva las entradas localhost. Abre la app pública e ingresa con
   `sebawitting@gmail.com`. Conecta el remitente desde Ajustes → Conexiones → Gmail.

La configuración pública de identidad usa el dominio de la app para mantener
las cookies en el mismo origen. La conexión independiente del remitente vuelve
a la API. Los callbacks deben coincidir exactamente con los registrados.
[Fuente oficial de Google](https://developers.google.com/identity/protocols/oauth2/web-server).

La audiencia sigue en Testing. Los usuarios de prueba ya incluyen
`sebawitting@gmail.com` y `sawitting@miuandes.cl`. Agrega Miguel después de conocer
su correo de ingreso. No crees otro cliente ni reemplaces los secretos existentes
para agregar las direcciones públicas. Las instrucciones de despliegue están en
[lookout-vercel.md](lookout-vercel.md).

`ALLOWED_SIGN_IN` must contain exact authorized login emails. The sender email
`sawitting@miuandes.cl` uses a separate mailbox connection. Never allow all
of `gmail.com` or `miuandes.cl` to make login work.

GLM setup is a Vault edit: paste the Z.ai API key into `lookout_v2_glm_api_key`.
Dom reads it server-side for each request. The endpoint is the regular Z.ai API,
`https://api.z.ai/api/paas/v4`; no AI Gateway key is needed for the default GLM model.
See `evaluation/supabase/README.md` for the restricted reader and verification.

## Gmail de auspicios

La configuración local ya tiene Gmail API habilitada, el callback
`http://localhost:4311/google/mailbox/callback` y los permisos `gmail.readonly` y
`gmail.send` declarados. El callback de identidad permanece independiente.
Google Cloud usa el proyecto `vaulted-broker-510423-v7`.

En **Ajustes → Conexiones → Gmail**, conecta `sawitting@miuandes.cl`. Elige esa
cuenta en Google y acepta sus permisos. La sesión de Lookout sigue perteneciendo
a `sebawitting@gmail.com`. Los tokens del remitente se cifran antes de guardarlos
en `lookout_v2.lookout_mailbox`; no sustituyen la cuenta Google de ingreso.

Google mantiene la audiencia en Testing. Con permisos Gmail, sus tokens de
actualización vencen a los siete días. Reconecta el remitente al vencer el permiso.
El paso a producción requiere revisar la publicación y verificación de Google.
[Fuente oficial de Google](https://developers.google.com/identity/protocols/oauth2).

Un borrador requiere una aprobación vigente y un clic humano en **Enviar**.
Editar contenido o destinatario invalida la aprobación. Dom, Hermes y las claves
API no pueden aprobar ni enviar correos. Una respuesta incierta de Gmail se
comprueba por su Message-ID antes de permitir otra decisión humana.

## Local runtime on an 8 GB Mac

Use the existing compiled app and API against the private Supabase schema.
Keep `NODE_ENV=production` in both processes. Mixing a development API with
`next start` creates incompatible session cookies and returns users to sign-in.
The Next configuration limits build workers on machines with 8 GB or less.

Prefer `bash scripts/start-lookout.sh` from the repository root. These are the manual equivalents for troubleshooting; do not run them alongside the launcher:

```sh
cd apps/api
NODE_ENV=production bun dist/main.js
```

```sh
cd apps/app
NODE_OPTIONS=--max-old-space-size=512 node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 4310
```

The root `.env` supplies the database, URLs, allowlist and bridge secret.
Keep Docker's demo database and `eve dev` stopped during compiled runtime checks.
For Dom, `apps/agent/scripts/start.ts` starts the built Nitro entrypoint directly.
It avoids loading the Eve development CLI. Use Node 24 and `bun run start` from
`apps/agent`, with `NODE_OPTIONS=--max-old-space-size=512` and
`NITRO_HOST=127.0.0.1` for local use. `AGENT_PORT` supplies its port.
Stop the app before rebuilding it. Build only the changed package, sequentially;
do not run the monorepo build alongside servers. Stop the verification processes
when the user no longer needs the local app. The GLM key remains in Vault.

## The agent bridge

```sh
AGENT_URL="http://127.0.0.1:2000"   # 127.0.0.1, not localhost: eve dev is IPv4-only
AGENT_BRIDGE_SECRET="$(openssl rand -base64 32)"
```

| Agent tab error | Cause |
| --- | --- |
| `503` | `AGENT_BRIDGE_SECRET` unset in the app's process |
| `401` | The two processes hold different secrets, **or** `passThroughEnv` in `apps/app/turbo.json` / `apps/agent/turbo.json` is missing the pair (Turbo is strict-env) |
| `502` | Agent not running, or `AGENT_URL` wrong |

`localDev()` accepts any loopback request, so `curl 127.0.0.1` proves nothing about
the bridge — send `-H 'Host: agent.example.com'`. `GET /eve/v1/info` is the whole
inventory, including a `diagnostics` count that finds files eve silently ignored.

## Running the agent

The agent package's default `dev` command is interactive `eve dev`. The root
Turbo task marks it interactive, so select the agent pane and press Enter before
using the eve TUI. Run `turbo run dev:headless --filter=agent` when a terminal
cannot render the TUI; that uses `eve dev --no-ui`, and the Turbo pane is the
record because only interactive development writes `.eve/logs/` for `eve logs`.
Reach for the Turbo task rather than `bun run --filter=agent dev:headless`: the
package script alone skips `dev:prepare`, so the agent would start against
unmigrated tables.

`hooks/activity.ts` is the replacement narration, **to stderr** (the TUI hides
stdout), printing shape everywhere and argument contents outside production only. It
is **not the audit trail** — `hooks/audit.ts` writes `AgentEvent` regardless.

- A second `bun run dev` fails the whole turbo run.
- An orphaned agent holds the port: `lsof -nP -iTCP:2000 -sTCP:LISTEN`.

### Nothing is researching, and the queue only grows

**`eve dev` never fires schedules on their cron cadence**, and everything visible
still works — the row is written, the sheet says *Queued*, and `dispatch.ts` is never
called. The poke covers this **only when `AGENT_BRIDGE_SECRET` is set**; unset,
`poke()` returns silently and the queue looks exactly like a slow agent.

Tasks the API did not write (`schedule_recheck`) and anything queued while the agent
was down still need a manual run:

```sh
bun run --filter=agent dispatch    # exact production path, both lanes, real credits
```

Its printed `sessionIds` are research rows only, so a run that resolved forty logos
prints an empty list and was not idle. `eve start` and Vercel do run the schedule.

## `vercel env pull` writes `.env.local`, which wins

`.env.local` is the override the loader reads *last*, and `vercel env pull` writes
**production** credentials there by default. Pull once and every process silently
points at production — not as an error, but as `bun run dev` working perfectly against
the live database. On 2026-08-01 eleven migrations landed on Neon from a laptop.

1. **Pull somewhere inert**: `vercel env pull .env.vercel`.
2. **`packages/db/scripts/require-local-db.ts` guards `db:migrate`, `db:push`,
   `db:reset`, `db:seed`** and takes `ALLOW_REMOTE_DB=1`. `db:deploy` is unguarded on
   purpose. It reads the root files directly rather than `process.env`, because Bun
   auto-loads the working directory's `.env` while Prisma's CLI only sees
   `@crm/env/load`.

## Migrations run on the production deploy, and nowhere else

`apps/api/scripts/build-func.mjs` runs `prisma migrate deploy` during the crm-api
build, gated on `VERCEL_ENV === "production"`. The schema therefore moves when the
release pull request merges and `release` deploys — with the code that needs it,
and once rather than once per branch.

Preview deploys share the production database: `DATABASE_URL` is a single value
across production, preview and development. Until that changes, **a preview of a
branch that adds a migration runs against a database without those tables** — it
builds, and the pages that touch them fail. Test schema changes locally, where
`bun run dev` migrates for you. Before the gate existed the reverse was true and
worse: every preview applied its own migrations to the production database, so on
2026-08-07 the live schema ran six migrations ahead of the live code all day.

### `migrate deploy` is not proof the schema is right

The build follows the deploy with `prisma migrate diff --exit-code` against
`schema.prisma` and shouts in the build log when they disagree. **`No pending
migrations to apply` only means `_prisma_migrations` has a row for every file** —
it says nothing about what the tables actually look like.

They came apart once. A `prisma db push` shaped production from a laptop, the
migration rows were recorded as applied without their SQL ever running, and
`agentConversationAttachment` went live without its `position` column. Every deploy
reported nothing pending, for days, while `conversations.builderById` returned 500.
The tell is an object in the database that no migration defines — there was an
`agentConversationAttachment_submissionId_createdAt_idx` that appears in no
migration file, only in a `db push` of an older schema.

Reconciling is one command, and it is worth reading before running:

```sh
DATABASE_URL="…" bunx prisma migrate diff \
  --from-config-datasource --to-schema prisma/schema.prisma --script
```

## Secrets hygiene

`.gitignore` ignores `.env` and `.env.*` with one negation for `.env.example`, so
`.env.bak` is ignored too. `.env.example` ships no secret — placeholders are empty
strings, asserted by `packages/env/test/root.spec.ts`. **Generate your own secret**;
never reuse one from an example, a tutorial, or another environment.

## Tests

```sh
bun run --filter=api test
bun run --filter=agent test    # integration specs need DATABASE_URL + real Postgres
```

### The test database rebuilds itself when it drifts

`bun run db:test` creates `crm_test` and runs `migrate deploy` on it. The database
name must end in `_test`; the suite deletes rows it expects to put back, so it
refuses anything else.

**`migrate deploy` only applies migrations that are missing. It never removes a
table, a column or a constraint the database has and the schema does not.** A
`crm_test` built on a branch that was later abandoned therefore keeps that branch's
objects forever, and `db:test` used to report `already exists` and move on. The
extra objects are invisible until one of them rejects a write, and then the failure
names a constraint that appears in no migration and in no schema — a stray
`trackedEvent_visitorId_fkey` once failed seven tracking specs this way, on every
branch, for as long as the database survived.

So `db:test` now checks the database it found and rebuilds it when either is true:

- **It holds a migration this branch does not have.** The database came from
  another branch. The name of the first one is printed.
- **It no longer matches `schema.prisma`**, by `prisma migrate diff`. Something
  was pushed or altered by hand.

A rebuild drops the database and re-runs every migration, and it says which of the
two reasons fired. Force one with `bun run db:test --reset`. Nothing else in the
repo may drop a database, and this may only because the `_test` suffix is checked
first.
