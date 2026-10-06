# Evaluación Enterprise Lookout V2

Base: trycompai/crm release 1.15.3, commit 6d4793dd6d7aeea91aa6a034e00b17d7408a2d08.

Todos los datos de scenario.json son ficticios. Los dominios .invalid no son destinatarios reales. El presupuesto total es $900.000 CLP; la meta de auspicios monetarios es $600.000. Los $200.000 y 180 latas son propuestas, no compromisos ni ingresos.

La V2 ya incorpora trabajos, eventos, presupuestos, aportes, compromisos y borradores en la base local. Consulta `STATUS.md` para capacidades verificadas y límites reales.

La estructura de la V2 también está creada y probada en el Supabase existente, dentro del esquema privado `lookout_v2`. La conexión remota y sus pruebas están documentadas en `supabase/README.md`. El laboratorio de abajo sigue siendo ficticio y local.

Base local exclusiva: localhost:55439/lookout_v2_lab. App: http://localhost:4310. API: http://localhost:4311. Sin credenciales de correo ni IA.

## Arranque local

Desde esta carpeta, iniciar Docker Desktop y ejecutar:

```sh
docker start lookout-v2-lab-postgres
```

En tres terminales:

```sh
cd apps/api
ALLOWED_SIGN_IN=auth-test@example.invalid npx --prefix /tmp --yes bun@1.3.12 ../../evaluation/api.ts
```

```sh
cd apps/app
LOOKOUT_LOCAL_EVALUATION=1 NEXT_TELEMETRY_DISABLED=1 npx --prefix /tmp --yes bun@1.3.12 run dev --hostname 127.0.0.1 --port 4310
```

```sh
npx --prefix /tmp --yes bun@1.3.12 evaluation/portal.ts
```

Abrir http://localhost:4312 para seleccionar usuario ficticio. El portal crea sesiones solo para la base de laboratorio y escucha únicamente en 127.0.0.1. Las sesiones duran 24 horas. No está destinado a desplegarse.

El portal renueva la sesión ficticia en cada acceso. La autenticación original sigue activa. El bypass local de onboarding está restringido al modo de desarrollo y a la base de laboratorio.

## Verificación de datos

Desde `apps/api`:

```sh
npx --prefix /tmp --yes bun@1.3.12 run ../../evaluation/verify-events.ts
```

La prueba se niega a usar una base distinta del laboratorio local y limpia únicamente sus propios registros temporales.

## Acceso privado

La pantalla `/sign-in` permite ingresar o activar una cuenta con invitación. El alta exige un correo incluido en `ALLOWED_SIGN_IN`, una contraseña de al menos 12 caracteres y un código personal de un solo uso. La prueba de integración local se ejecuta con:

```sh
cd apps/api
ALLOWED_SIGN_IN=auth-test@example.invalid npx --prefix /tmp --yes bun@1.3.12 run ../../evaluation/verify-invites.ts http://localhost:4310
```

Para los usuarios reales, agregar sus correos exactos a `ALLOWED_SIGN_IN` en la API y generar cada invitación con `evaluation/create-invite.ts`. El archivo del código queda en `.scratch/lookout-invites/`, fuera de Git. Este paso requiere los correos definitivos de ingreso.
