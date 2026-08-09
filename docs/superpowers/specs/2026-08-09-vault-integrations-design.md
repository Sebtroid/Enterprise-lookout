# Enterprise Lookout V2 — Vault, integraciones y presupuesto

Fecha: 2026-08-09

## Decisión

Supabase Vault será la fuente única de credenciales privadas del workspace. Esto incluye claves de APIs, secretos OAuth, tokens OAuth y la contraseña de la base guardada como credencial de infraestructura. Los valores podrán administrarse desde Configuración y revelarse explícitamente por el propietario.

La URL del proyecto y la publishable key de Supabase no se consideran secretos. El presupuesto y los metadatos de conexiones se guardarán en tablas normales protegidas por RLS.

## Objetivos

- Permitir configurar servicios desde cualquier computador.
- Evitar archivos locales como fuente permanente de secretos.
- Conectar varias cuentas Gmail y la cuenta Microsoft 365 institucional `uc.cl` de José Miguel.
- Mostrar estado, permisos, última comprobación y presupuesto desde Configuración.
- Mantener cada acceso, revelado, rotación o eliminación atribuido en el registro de actividad.

## Modelo de datos

`workspace_secret_registry` guardará únicamente metadatos:

- `workspace_id`
- `provider`
- `secret_name`
- `vault_secret_id`
- `masked_hint`
- `status`
- `last_tested_at`
- `updated_by`
- timestamps

El valor secreto residirá exclusivamente en `vault.secrets`. La aplicación nunca duplicará el valor en tablas públicas, logs, respuestas de error ni actividad.

`workspace_ai_settings` guardará:

- presupuesto mensual en USD;
- umbral de alerta, inicialmente 80%;
- política de corte, inicialmente 100%;
- modelo y proveedor habilitado;
- moneda y zona horaria operativa.

Los tokens OAuth usarán entradas separadas de Vault por proveedor, workspace y cuenta. Las tablas de cuentas guardarán el identificador del secreto, email, tenant, scopes, expiración, estado de sincronización y permisos, pero nunca el token.

## Acceso y seguridad

- Solo el propietario del workspace puede crear, reemplazar, revelar o eliminar secretos.
- Los miembros pueden ver el estado de una integración y conectar su propia cuenta cuando tengan permiso, pero no revelar secretos de infraestructura.
- Cada revelado requerirá confirmación explícita y una sesión reciente; la respuesta será `no-store`, no se persistirá en el navegador y generará un evento de auditoría.
- `anon` y `authenticated` no tendrán acceso directo a `vault.secrets` ni `vault.decrypted_secrets`.
- Las operaciones de Vault pasarán por una función interna controlada. No se expondrán funciones privilegiadas de propósito general.
- Los errores nunca incluirán valores secretos.
- Las pruebas verificarán que las APIs, Server Actions y herramientas no filtren secretos.

## Configuración

La pantalla se dividirá en:

1. **Equipo e identidades**: Sebastián, José Miguel, instituciones y firmas.
2. **Cuentas de correo**: Gmail y Microsoft 365, permisos, remitente activo, sincronización y desconexión.
3. **Integraciones**: MiniMax, Hunter y futuros proveedores con acciones Guardar, Probar, Reemplazar y Eliminar.
4. **Caja fuerte**: credenciales de infraestructura, incluida la contraseña de Supabase, con acción Revelar disponible solo para el propietario.
5. **IA y presupuesto**: límite mensual, gasto, alerta, corte y trabajos pendientes.

Los formularios de secretos usarán campos de contraseña, no precargarán valores y limpiarán el formulario después de guardar.

## Gmail y Microsoft 365

Gmail conservará OAuth delegado con permisos de lectura y envío.

Microsoft se registrará como aplicación multitenant para cuentas de trabajo o educación y usará el endpoint `organizations`. El flujo solicitará permisos delegados mínimos para identidad, acceso sin conexión, lectura y envío de correo. José Miguel iniciará sesión con su cuenta `uc.cl`; Enterprise Lookout nunca recibirá su contraseña.

Si la UC bloquea consentimiento de usuario, Configuración mostrará `Requiere aprobación del administrador` y conservará instrucciones y tenant detectado. No se intentará eludir la política institucional.

La sincronización inicial cubrirá doce meses y la incremental utilizará el mecanismo delta de Microsoft Graph. Los primeros correos y envíos masivos mantendrán los mismos controles de aprobación, permisos, supresión y límite diario definidos para Gmail.

## Flujo de secretos

1. El propietario ingresa un secreto en Configuración.
2. Una operación autenticada valida workspace, rol, proveedor y nombre permitido.
3. El servidor crea o actualiza la entrada en Supabase Vault.
4. Solo el UUID, el estado y una pista enmascarada se guardan como metadatos.
5. Probar conexión ejecuta una solicitud mínima desde el servidor y registra únicamente el resultado sanitizado.
6. Los workers obtienen el secreto por UUID cuando ejecutan un trabajo; no lo incluyen en resultados ni logs.

## Credenciales Supabase

La contraseña de Postgres se guardará en Vault como registro de recuperación y podrá revelarse desde la Caja fuerte. No será necesaria para el uso normal de la app ni para Codex mediante el conector OAuth de Supabase.

La aplicación desplegada necesitará conocer la URL del proyecto y su publishable key. Como no son privadas, podrán configurarse en el entorno del despliegue. Las credenciales internas que Supabase entrega automáticamente a Edge Functions no se copiarán a la interfaz.

Vault no reemplaza un respaldo independiente del proyecto: si el proyecto se elimina, sus secretos se eliminan con él. Las credenciales de recuperación de la cuenta Supabase deben mantenerse también en un gestor personal del propietario.

## Pruebas de aceptación

- Un anónimo y un miembro no propietario no pueden listar, crear, revelar ni eliminar secretos.
- El propietario puede guardar, probar, reemplazar, revelar y eliminar una credencial desde Configuración.
- Ninguna respuesta habitual devuelve secretos completos.
- El revelado es explícito, no cacheable y auditado.
- MiniMax deja de aceptar trabajos al alcanzar el presupuesto configurado.
- Gmail y Microsoft almacenan tokens en Vault y las tablas solo contienen referencias.
- José Miguel puede conectar una cuenta Microsoft 365 `uc.cl` o recibir un estado accionable si el tenant exige aprobación administrativa.
- La desconexión revoca o elimina tokens y detiene sincronizaciones y envíos.
- Las pruebas de seguridad y Supabase Advisors no reportan acceso público a Vault.

## Fuera de alcance

- Convertir Vault en un gestor de contraseñas personal general.
- Guardar credenciales de cuentas que no usa Enterprise Lookout.
- Eludir políticas de consentimiento de la Universidad Católica.
- Exponer secretos a ChatGPT, MCP o herramientas del navegador.
