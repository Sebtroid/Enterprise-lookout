# Enterprise Lookout V2 en Vercel

La V2 usa tres proyectos independientes del Enterprise Lookout anterior.

| Servicio | Dirección pública | Carpeta raíz | Compilación |
| --- | --- | --- | --- |
| Interfaz | https://enterprise-lookout-v2.vercel.app | apps/app | cd ../.. && bun run --cwd apps/app build |
| API | https://enterprise-lookout-v2-api.vercel.app | raíz | bun apps/api/scripts/build-func.mjs |
| Dom | https://enterprise-lookout-v2-dom.vercel.app | raíz | cd apps/agent && bun run build && cp -R .vercel/output ../../.vercel/output |

Los proyectos usan `bun install --frozen-lockfile`. Las compilaciones ocurren en
Vercel. No necesitan Docker ni servidores de desarrollo activos en el Mac.
El despliegue se realiza desde la carpeta de V2 mediante CLI. La rama
`codex/lookout-v2` del repositorio `Sebtroid/Enterprise-lookout` guarda el código
de V2 y conserva `main` como V1. Los despliegues no están conectados a esa rama.
Las automatizaciones de publicación del CRM original quedan fuera de esta
importación. `trycompai/crm` se conserva como referencia de origen; los cambios
de Enterprise Lookout se publican en el repositorio de Sebastián.

## Contrato de la API

`apps/api/src/generated/server.ts` está generado y admitido expresamente por
`apps/api/.gitignore`. Incluye las operaciones nuevas de Lookout.
El build de interfaz consume ese archivo. No ejecuta `nestjs-trpc generate` en
Vercel: su binario Linux exige una versión glibc que no tiene el entorno actual.
Después de cambiar routers o contratos, regenera el archivo localmente antes
de desplegar. No excluyas ese archivo del conjunto de fuentes.

## Configuración de servidor

Los tres proyectos tienen configuradas las direcciones públicas y los secretos
de conexión mediante variables cifradas de Vercel. Los valores privados no están
en este documento. `.vercelignore` y los archivos gitignore excluyen `.env`,
`.scratch`, archivos de evaluación y credenciales locales de la subida.

Las variables de dirección son:

```text
APP_URL=https://enterprise-lookout-v2.vercel.app
API_URL=https://enterprise-lookout-v2-api.vercel.app
BETTER_AUTH_URL=https://enterprise-lookout-v2.vercel.app
AGENT_URL=https://enterprise-lookout-v2-dom.vercel.app
```

`DATABASE_URL`, `BETTER_AUTH_SECRET`, `AGENT_BRIDGE_SECRET`, `ALLOWED_SIGN_IN` y
`CRON_SECRET` se guardan cifradas. Las credenciales Google y la clave GLM permanecen
en Supabase Vault. No se copian al cliente ni al código de las funciones.

Los proyectos no tienen un muro adicional de acceso Vercel. Better Auth y la
lista privada de correos controlan el acceso a la app. Los endpoints internos de
Dom requieren la firma del puente. El rol PostgreSQL está limitado a `lookout_v2`.

## Google pendiente de aceptación pública

El cliente OAuth ya existe. Sigue los cinco pasos de [setup.md](setup.md#google-cloud)
para agregar las direcciones públicas sin reemplazar el cliente ni sus secretos.

```text
Origen JavaScript:
https://enterprise-lookout-v2.vercel.app

Callback del ingreso Google:
https://enterprise-lookout-v2.vercel.app/api/auth/callback/google

Callback del remitente Gmail:
https://enterprise-lookout-v2-api.vercel.app/google/mailbox/callback
```

Sebastián ingresa con `sebawitting@gmail.com`. Luego conecta
`sawitting@miuandes.cl` en Ajustes → Conexiones → Gmail. Son dos autorizaciones
independientes. No hay remitente autorizado aún en el último estado comprobado.

## Ejecuciones automáticas

El equipo usa Vercel Hobby. Los crons configurados son diarios. Las acciones
manuales disparan la investigación o la sincronización desde la app.
La interfaz permite sincronizar Gmail; Dom también consulta el correo ya
sincronizado. Con Google en Testing, el remitente requiere reconexión al vencer
su token de actualización.

## Qué acredita el despliegue

Un estado READY acredita compilación y publicación. No acredita un ingreso
Google público, una conversación privada completa ni la entrega Gmail.
Esas aceptaciones requieren la sesión y autorización de Sebastián. Dom no
aprueba ni envía correos. Cada envío conserva revisión y aprobación humanas.
