# Enterprise Lookout V2

Centro operativo interno para conseguir auspicios y marcas. Dom ayuda a organizar
el día, investigar empresas, guardar contactos con fuentes y preparar correos.
Cada envío requiere revisión, aprobación y un clic humano.

Esta rama, `codex/lookout-v2`, contiene la reconstrucción de la app sobre
[Comp AI CRM](https://github.com/trycompai/crm), versión 1.15.3. `main` conserva la
versión anterior de Enterprise Lookout. La importación parte del historial del
repositorio de Sebastián; no requiere combinar historias Git independientes.
La licencia MIT y la atribución original se conservan en [LICENSE](LICENSE).

## Cómo se organiza

- Sección personal con acceso deliberado a los trabajos de otra persona.
- Trabajos y eventos con avance de auspicios, presupuesto y seguimientos propios.
- Base compartida de empresas y contactos con categorías, fuentes y bloqueos.
- Aportes en dinero, productos y servicios separados.
- Inicio con chat Dom, pendientes, borradores y respuestas sincronizadas.

Dom puede guardar candidatas, crear eventos solicitados, guardar contactos y
programar seguimientos dentro del trabajo propio. Dom no aprueba ni envía correos.
Cambiar el contenido o destinatario invalida la aprobación del borrador.

## Servicios

| Servicio | Código | Dirección configurada |
| --- | --- | --- |
| Interfaz Next.js | apps/app | https://enterprise-lookout-v2.vercel.app |
| API NestJS y tRPC | apps/api | https://enterprise-lookout-v2-api.vercel.app |
| Dom sobre Eve y GLM | apps/agent | https://enterprise-lookout-v2-dom.vercel.app |

La API y Dom usan el Supabase existente y el esquema privado `lookout_v2`.
La app usa Better Auth para iniciar sesión con Google. La cuenta remitente Gmail
se conecta por separado. La clave GLM y las credenciales Google permanecen en
Supabase Vault. El repositorio no contiene claves ni datos de las casillas.

## Desarrollo local con poca RAM

Requisitos: Node 24 y Bun 1.3.12. Copia `.env.example` a `.env` y configura la
conexión restringida a `lookout_v2`, las direcciones y los secretos de servidor.
La configuración existente de Supabase se explica en
[evaluation/supabase/README.md](evaluation/supabase/README.md).

```sh
bun install --frozen-lockfile
bun run start:lookout
```

El iniciador usa servicios compilados, inicia procesos en secuencia y limita la
memoria. Los pasos para compilar y los límites están en [docs/setup.md](docs/setup.md).
La configuración activa usa Supabase; no necesita Docker para funcionar.
El laboratorio ficticio se documenta por separado en
[evaluation/README.md](evaluation/README.md).

Las migraciones de `packages/db/prisma/migrations` incluyen la historia del CRM
original. Para el Supabase existente se usan las migraciones específicas de
`evaluation/supabase`, aplicadas al esquema aislado. No se deben ejecutar las
migraciones históricas sobre el proyecto remoto.

## Despliegue y configuración

[docs/lookout-vercel.md](docs/lookout-vercel.md) contiene las carpetas raíz,
comandos de compilación y variables de los tres servicios. Los pasos exactos del
cliente Google están en [docs/setup.md](docs/setup.md#google-cloud).

El contrato `apps/api/src/generated/server.ts` se incluye en Git y debe
regenerarse localmente después de cambiar routers. El build de interfaz en Vercel
consume ese contrato y evita el generador nativo incompatible con su entorno.

Los tres proyectos de Vercel están conectados a este repositorio. Cada subida a
`codex/lookout-v2` compila la interfaz, la API y Dom en Vercel, usando sus variables
de producción. `main` conserva V1. Las automatizaciones de PR y release del CRM
original no se incluyen en la importación.

## Verificación y límites

El 2 de octubre de 2026 los tres servicios alcanzaron READY en Vercel y pasaron
las compilaciones. Las pruebas focalizadas cubren contexto, operaciones,
candidatas, contactos, aprobaciones y proveedor GLM. El estado detallado y sus
límites están en [evaluation/STATUS.md](evaluation/STATUS.md).

La aceptación del ingreso Google público, una conversación completa desde la
interfaz y la conexión Gmail requieren comprobación con la sesión del usuario.
Un build o una respuesta GLM no sustituyen esas comprobaciones.

## Archivos privados

`.env`, las credenciales locales, `.scratch`, los builds, las dependencias y las
capturas de cuentas Google quedan fuera de Git. Los archivos SQL guardan esquema
y permisos; no contienen exportaciones de contactos, correo ni valores de Vault.
