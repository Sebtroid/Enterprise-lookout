# Enterprise Lookout V2

Workspace privado para investigar empresas, gestionar contactos y proyectos, trabajar correo Gmail con contexto CRM y controlar aportes y gastos.

## Stack

- Next.js 16, React 19, TypeScript y Tailwind CSS.
- Supabase Auth/Postgres con RLS por workspace, proyecto y cuenta Gmail.
- Gmail OAuth con tokens cifrados y sincronización incremental.
- Servicio de herramientas compartido por GPT Actions y MCP.
- MiniMax server-side como bibliotecario, con presupuesto mensual estricto.
- Vitest para dominio, seguridad, Gmail, OAuth, herramientas y compatibilidad V1.

## Desarrollo

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

El demo solo puede activarse fuera de producción con `NEXT_PUBLIC_APP_MODE=demo`. En producción la aplicación falla cerrada si falta autenticación o configuración.

Rutas V2: `/today`, `/projects`, `/companies`, `/contacts`, `/mail` y `/settings`.

## Base de datos y corte

```powershell
npm run v2:backup
npm run supabase:apply
npm run v2:migrate:dry-run
$env:CONFIRM_V2_MIGRATION='APPLY'; npm run v2:migrate
```

El respaldo requiere `SUPABASE_DB_URL` y `V2_BACKUP_ENCRYPTION_KEY`. La migración requiere además `V2_OWNER_USER_ID`; siempre corre en modo simulación salvo que se use `--apply` y la confirmación explícita. El procedimiento completo está en [docs/V2_CUTOVER.md](docs/V2_CUTOVER.md).

## Verificación

```powershell
npm test
npm run lint
npm run build -- --webpack
```

## Plugin privado

La fuente instalable vive en `plugins/enterprise-lookout`. Expone una skill de operación y un servidor MCP remoto en `/api/mcp`; GPT Actions usa `/api/v2/tools/*` y la misma capa de autorización e idempotencia.
