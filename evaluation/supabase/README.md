# Supabase de Enterprise Lookout V2

Proyecto existente: `qyructbgynzxqlqxvojf`, con acceso confirmado mediante la cuenta conectada `josemigueloaguado@gmail.com`. La V2 ocupa el esquema privado `lookout_v2` dentro de ese proyecto. Las tablas originales de `public` permanecen separadas.

El 30 de septiembre de 2026 se aplicó `20260930_lookout_v2_baseline.sql`, generado desde `packages/db/prisma/schema.prisma` con Prisma 7, y luego `20260930160000_lookout_sponsorship_company_index` para consultar los eventos de una empresa. El 1 de octubre se aplicó `20261001_lookout_v2_private_invites.sql` para el acceso privado. El 2 de octubre se aplicó `migrations/20261002010000_lookout_v2_mailbox.sql`, que incorpora el remitente independiente, los campos de aprobación vinculada al contenido y el estado de entrega. El esquema tiene **69 tablas**. La consulta de comparación `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` terminó sin diferencias después de la migración. El usuario `lookout_v2_app` tiene permisos de lectura y escritura sobre la tabla nueva y no puede leer ninguna de las 66 tablas originales de `public`. El rol `anon` no tiene acceso al esquema nuevo.

La conexión usa el **Session pooler** que muestra el panel Connect del proyecto, puerto 5432, con `?schema=lookout_v2`. La API verifica TLS con la CA pública incluida en `packages/db/src/supabase-root-ca.ts`; el build de Prisma usa `packages/db/certs/prod-ca-2021.crt`. La contraseña del rol está en el archivo local `.env.supabase.local`, ignorado por Git. No se debe copiar al repositorio ni al navegador. Para desplegar, configurar `DATABASE_URL` y `DIRECT_DATABASE_URL` con la conexión del rol y conservar `schema=lookout_v2` en ambas. El build rechaza una URL Supabase sin ese esquema.

No ejecutar la historia de migraciones original de `packages/db/prisma/migrations` contra el proyecto Supabase: incluye referencias explícitas a `public`. Los cambios futuros del modelo requieren una migración nueva y específica para `lookout_v2`, aplicada y comparada antes del despliegue.

La V2 usa Better Auth en su esquema privado. El ingreso Google de Sebastián ya se comprobó contra Supabase; Miguel queda pendiente de confirmar su correo. El alta por correo y contraseña requiere que el correo figure en `ALLOWED_SIGN_IN` y una invitación de un solo uso, cuyo hash se guarda en `lookout_invite`. Con los correos reales configurados, `evaluation/create-invite.ts correo@dominio.cl` genera un código que queda solo en `.scratch/lookout-invites/`, ignorado por Git. Configurar `ALLOWED_SIGN_IN` con los correos exactos tanto en la API como al crear invitaciones. No colocar los códigos ni las credenciales de PostgreSQL en el frontend o en el repositorio. La prueba local `evaluation/verify-invites.ts` pasó también a través del proxy web en `http://localhost:4310`.

No se importaron datos porque `public.companies`, `public.contacts`, `public.campaigns`, `public.campaign_contacts`, `public.projects` y `auth.users` están vacías. Los datos ficticios del laboratorio permanecen solo en Docker local.


## Google y GLM en Vault

La migración `migrations/20261001230339_lookout_v2_runtime_credentials.sql` está aplicada.
Crea tres entradas sin sobrescribir secretos existentes. El 1 de octubre se
completaron las dos entradas Google; GLM sigue pendiente:

- `lookout_v2_glm_api_key`: clave de la API de Z.ai para Dom.
- `lookout_v2_google_client_id`: ID del cliente OAuth web de Google Cloud.
- `lookout_v2_google_client_secret`: secreto del mismo cliente OAuth.

Editar el valor en el panel de Vault. No crear una segunda entrada con el mismo nombre.
El lector privado `lookout_v2.read_runtime_secret(text)` solo admite estos tres nombres.
`PUBLIC`, `anon` y `authenticated` no pueden ejecutarlo; `lookout_v2_app` no puede
leer Vault directamente. El script `evaluation/verify-runtime.ts` comprueba estos
permisos y muestra únicamente si cada entrada está configurada. La revisión de
Supabase no agregó alertas nuevas; las alertas existentes corresponden a extensiones
y tablas del esquema original `public`.

La cuenta autorizada de ingreso es `sebawitting@gmail.com`. `sawitting@miuandes.cl`
es el remitente de auspicios, conectado por un flujo independiente. No es una cuenta autorizada de ingreso. Miguel queda pendiente.
La V2 usa Better Auth, por lo que no hay que activar el proveedor Google en Supabase Auth.
El cliente Google local requiere origen `http://localhost:4310` y callback
`http://localhost:4311/api/auth/callback/google`. La V2 pública necesita su propia URL
real antes de agregar una redirección de producción; no usar la URL pública de V1.

Las credenciales Google se cargan al iniciar app y API; reiniciar ambos después de editarlas.
GLM lee su clave con cada solicitud. No hace falta reiniciar por un cambio de clave GLM.
La `.env` activa ya usa Supabase y el modo `production` en app y API. El laboratorio
queda respaldado en `.env.lab.saved`, ignorado por Git. Su contenedor permanece detenido.
El cliente web está en el proyecto Google `vaulted-broker-510423-v7`, Enterprise Lookout,
en modo de prueba, con `sebawitting@gmail.com` y `sawitting@miuandes.cl` como usuarios de prueba.
El retorno Google y la sesión real contra Better Auth ya se comprobaron.

`20261001_lookout_v2_install.sql` agrega únicamente el registro de instalación que
necesita el runtime; no carga datos de ejemplo. La conexión de Dom usa el mismo
`AGENT_BRIDGE_SECRET` que la app. Sus solicitudes de modelo requieren completar GLM.


## Remitente Gmail y entrega

La tabla `lookout_v2.lookout_mailbox` tiene RLS activa. El rol restringido
`lookout_v2_app` tiene permisos de lectura y escritura; `PUBLIC`, `anon` y
`authenticated` no tienen acceso. Los tokens se cifran con AES-256-GCM y se
vinculan al usuario. Las cuentas Google de ingreso permanecen en Better Auth.
No colocar los tokens en `Account` ni exponerlos por el estado público de conexión.

Google Cloud tiene Gmail API habilitada, los permisos `gmail.readonly` y
`gmail.send` declarados y el callback local
`http://localhost:4311/google/mailbox/callback` guardado. Todavía falta que
Sebastián elija `sawitting@miuandes.cl` y acepte el permiso de Google desde la app.
La revisión remota del 2 de octubre confirma cero remitentes conectados y cero
envíos. Los tests de entrega usan Gmail simulado y no envían mensajes reales.

Una aprobación queda vinculada a contenido y destinatario. Una entrega reclama
el borrador de manera atómica. Una respuesta de transporte incierta queda en
`send_uncertain` y no se reintenta automáticamente. La app comprueba el Message-ID
antes de informar un envío como confirmado. Aprobar y enviar requieren sesión
humana; las claves API no pueden ejecutar esas operaciones.

La comparación remota de Prisma posterior a esta migración termina en
`No difference detected.`. No se ejecutó la historia original de migraciones ni
se cambiaron las tablas del esquema `public`.
