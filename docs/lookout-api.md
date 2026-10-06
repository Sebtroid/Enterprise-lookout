# API de Lookout para Hermes y Custom GPT

La API local está en `http://localhost:4311`. La app está en
`http://localhost:4310`. Ambas usan el Supabase privado existente.
El cliente Python y una clave API real consultaron el tablero durante la prueba.
La clave temporal se revocó después. Hermes y Custom GPT todavía no están
instalados ni conectados a un servidor público.

## Clave personal

En **Ajustes → Claves API**, crea una clave para tu agente y elige su vencimiento.
Copia el valor cuando aparezca: la app solo lo muestra una vez. Configura
`LOOKOUT_API_KEY` en el entorno del equipo que ejecuta el agente. No la pegues
en instrucciones de un GPT, mensajes, capturas ni archivos del repositorio.

La clave actúa como su dueño. Puede consultar intencionalmente la sección de
otra persona y la base compartida. Los cambios de eventos y trabajos se limitan
a la sección de su dueño. La API valida los permisos y los datos de cada operación.

Las claves API no pueden aprobar borradores, enviar mensajes, conectar Gmail ni
crear otras claves. Esas operaciones requieren una sesión humana.

## Cliente para el servidor de Hermes

`scripts/lookout-api.py` usa Python estándar. No instala dependencias ni carga
un modelo local. Configura `LOOKOUT_API_URL` con el origen de la API y
`LOOKOUT_API_KEY` con tu clave personal.

```sh
python3 scripts/lookout-api.py workspace
python3 scripts/lookout-api.py workspace --work-area-id ID_DEL_TRABAJO
python3 scripts/lookout-api.py contacts --company-id ID_DE_LA_EMPRESA
python3 scripts/lookout-api.py profile --entity company --id ID_DE_LA_EMPRESA
python3 scripts/lookout-api.py usage --entity company --id ID_DE_LA_EMPRESA
python3 scripts/lookout-api.py runtime
```

El primer resultado contiene los identificadores reales de tus trabajos,
eventos y empresas. `--owner-id` permite consultar deliberadamente otra sección.
`contacts` requiere una empresa; `profile` y `usage` requieren tipo e identificador.
La API remota requiere HTTPS. El cliente admite HTTP únicamente en el equipo local
y bloquea redirecciones para impedir que la clave llegue a otro servidor.

Para ejecutar una acción solicitada, guarda su objeto JSON en un archivo:

```sh
python3 scripts/lookout-api.py action --command-file accion.json
```

El archivo contiene la acción directamente. El cliente agrega el envoltorio
`command`. Ejemplo de estructura para preparar un borrador:

```json
{
  "action": "saveDraft",
  "eventId": "ID_REAL_DEL_EVENTO",
  "sponsorshipId": "ID_REAL_DEL_AUSPICIO",
  "subject": "Propuesta de auspicio",
  "body": "Texto para revisión humana"
}
```

Sustituye los dos identificadores por valores reales del tablero antes de ejecutar el ejemplo.
Las acciones permitidas son `createWork`, `updateWork`, `createEvent`,
`updateEvent`, `linkCompany`, `updateSponsorship`, `saveContribution`, `saveBudget`,
`saveBenefit`, `saveDraft` y `saveProfile`. El contrato completo de la API está en
`http://localhost:4311/openapi.json`. La interfaz de la API está en su raíz.

## Contrato para un GPT privado

`evaluation/integrations/lookout-agent.openapi.json` contiene seis operaciones,
once acciones permitidas y autenticación mediante el encabezado `x-api-key`.
El contrato excluye aprobación, envío y conexión de correos. Los cambios de datos
usan `x-openai-isConsequential: true`.

El servidor del archivo es **un marcador sin servicio**:
`https://lookout-api.example.invalid`. Regenera el contrato cuando exista la URL
pública real de V2:

```sh
python3 evaluation/export-agent-openapi.py --server https://TU_API_PUBLICA_REAL
```

En el editor del GPT, agrega una acción, pega el contrato y configura autenticación
API Key con encabezado personalizado `x-api-key`. Guarda la clave en ese campo.
Prueba primero `lookout_workspace`. El contrato local no hace accesible
`localhost` desde ChatGPT. Esta integración necesita la API publicada con HTTPS.
[Guía oficial de GPT Actions](https://developers.openai.com/api/docs/actions/getting-started),
[autenticación oficial](https://developers.openai.com/api/docs/actions/authentication).

Instrucciones sugeridas para el agente:

```text
Ayuda a gestionar auspicios en Enterprise Lookout. Responde en español.
Consulta lookout_workspace antes de proponer cambios y usa sus identificadores reales.
Trabaja en la sección y trabajo seleccionados por el usuario.
Las empresas y contactos son compartidos; los acuerdos, aportes y presupuestos pertenecen al evento.
Separa dinero, productos y servicios. Los montos del presupuesto de eventos están en CLP.
Guarda categorías, fuentes y estado de verificación sin inventar contactos ni datos.
Prepara borradores solo cuando el usuario lo solicite. Nunca declares un correo aprobado o enviado.
Explica los errores de la API y no reintentes automáticamente una escritura con resultado incierto.
```

## Evidencia y activaciones pendientes

`evaluation/verify-agent-api.ts` comprueba acceso con una clave personal temporal,
el cliente Python y los bloqueos de sesión humana. Su limpieza revoca la clave
temporal por identificador, dueño y nombre. No crea eventos ni envía mensajes.

La clave de GLM en Vault activa Dom dentro de la app. La clave de Lookout autoriza
a Hermes o al GPT a consultar esta API. Son credenciales distintas.
La prueba actual no valida un Custom GPT importado, Hermes instalado, una
conversación real con GLM ni acceso autenticado a una V2 pública.
