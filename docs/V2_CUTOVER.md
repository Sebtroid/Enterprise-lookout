# Corte Enterprise Lookout V2

Este procedimiento mantiene V1 intacto hasta que V2 haya sido validado. No ejecutar el corte directamente sobre producción sin completar primero un ensayo en staging.

## 1. Preparación

1. Crear un proyecto Supabase de staging restaurado desde producción.
2. Configurar `.env.local` sin copiar secretos al repositorio.
3. Definir `APP_ALLOWED_EMAILS` con solo Sebastián y José Miguel.
4. Definir `NEXT_PUBLIC_APP_MODE=production` en Vercel; nunca usar `demo` en producción.
5. Rotar service role, password de base, Gmail client secret, clave de cifrado, cron secret y cualquier token histórico de DOM.
6. Revisar en Google Cloud que Gmail OAuth solo solicite `gmail.readonly` y `gmail.send`, con los redirect URI exactos de staging y producción.

## 2. Respaldo cifrado

Definir `SUPABASE_DB_URL` y una clave distinta de las credenciales de producción:

```powershell
$env:V2_BACKUP_ENCRYPTION_KEY='<frase-larga-guardada-fuera-del-repo>'
npm run v2:backup
```

El comando usa el dump oficial de Supabase para generar esquema, datos y roles; cifra cada archivo con AES-256-GCM y escribe hashes SHA-256 en `manifest.json`. Por defecto guarda fuera del repositorio, en `../enterprise-lookout-backups/<fecha>`.

Guardar una copia del directorio cifrado en una ubicación separada y verificar los hashes antes de migrar.

Para ensayar la recuperación, define `V2_BACKUP_SOURCE` y un `V2_RESTORE_DIR` vacío, luego ejecuta `npm run v2:backup:decrypt`. El comando valida cada checksum y la autenticidad AES-GCM antes de escribir los SQL descifrados.

## 3. Migraciones aditivas

```powershell
npm run supabase:apply
```

El runner detecta una base vacía, instala primero el esquema V1 requerido y luego aplica en orden todas las migraciones versionadas. En una base existente no reaplica el esquema histórico. Registra cada archivo en `app_migrations.applied` y ejecuta cada migración en una transacción.

Comprobar:

- login Google y magic link;
- membresía activa de ambos usuarios;
- RLS con usuario anónimo, miembro, dueño y compañero lector;
- Advisor de seguridad y rendimiento de Supabase;
- que `gmail_accounts.encrypted_*` y `tool_connections.token_hash` no sean seleccionables por clientes autenticados.

## 4. Migración histórica

Con el UUID del perfil propietario:

```powershell
$env:V2_OWNER_USER_ID='<uuid-de-sebastian>'
npm run v2:migrate:dry-run
```

Comparar los conteos con la base V1. Si son razonables:

```powershell
$env:CONFIRM_V2_MIGRATION='APPLY'
npm run v2:migrate
```

Se migran proyectos y relaciones con evidencia; empresas y contactos dudosos cambian a `record_state=quarantined` y se copian a `legacy_quarantine`. No se elimina ningún registro. Revisar propietarios e instituciones en `/settings/migration`.

Los hilos Gmail se incorporan mediante la sincronización V2 una vez conectada la cuenta correspondiente. Solo se conservan cuerpos completos al vincularlos al CRM.

## 5. Validación y corte

1. Ejecutar `npm test`, `npm run lint` y `npm run build -- --webpack`.
2. Conectar cada Gmail, asignar permisos y sincronizar 12 meses.
3. Probar lectura, redacción, aprobación bulk y envío con una cuenta controlada.
4. Probar una investigación completa y revisar fuentes/fact revisions.
5. Probar el presupuesto MiniMax con un límite bajo en staging.
6. Probar el plugin/MCP con una conexión por usuario y confirmar atribución.
7. Verificar vistas a 1440, 1024 y 390 px, teclado y foco visible.
8. Programar mantenimiento, congelar V1, repetir respaldo, aplicar migraciones y comparar conteos/checksums.
9. Desplegar V2 y ejecutar una prueba externa anónima contra cada ruta y API protegida.

## 6. Rollback

La primera opción es volver al tag Git V1 y mantener las tablas V2 sin usarlas. Como las migraciones son aditivas, V1 continúa disponible durante la ventana de aceptación. Si los datos también deben retroceder, restaurar el dump cifrado en un proyecto Supabase nuevo y cambiar las variables de Vercel; no ejecutar borrados masivos sobre la base original.
