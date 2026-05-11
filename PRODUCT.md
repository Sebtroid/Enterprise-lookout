# Brief de Producto

## Propósito

Prospección de Auspicios es un dashboard privado de operaciones para gestionar campañas de búsqueda de auspiciadores. Ayuda a un equipo pequeño a pasar de listas crudas de empresas a contactos revisados, mails aprobados, gestión de respuestas y seguimiento del pipeline.

El producto debe sentirse como un centro de control interno: rápido de escanear, difícil de usar mal y enfocado en decidir la próxima acción.

## Usuarios Principales

- Dueño de campaña: crea proyectos, revisa el pipeline, decide qué empresas vale la pena perseguir y aprueba mensajes salientes.
- Operador de investigación: importa leads, enriquece datos de empresas/contactos, marca duplicados y prepara mensajes para revisión.
- Remitente o dueño de cuenta: conecta Gmail, envía outreach aprobado y gestiona respuestas de empresas interesadas.

## Trabajos Principales

1. Elegir una campaña o contexto.
2. Importar o agregar empresas y leads.
3. Clasificar empresas como sirve, investigar o no sirve.
4. Revisar contactos y priorizar decisores.
5. Revisar mails salientes antes de que se envíe algo.
6. Enviar mails aprobados desde cuentas Gmail conectadas.
7. Sincronizar y aprobar respuestas.
8. Seguir el avance de empresas en el pipeline de auspicios.
9. Pedir tareas y ayuda a Dom con contexto del proyecto.

## Principios de Producto

- La aprobación humana es central. La IA y la automatización pueden redactar, enriquecer, clasificar o sugerir, pero los flujos de alto impacto deben mantener revisión explícita.
- Cada pantalla debe responder "qué necesita mi atención ahora".
- El contexto de campaña siempre debe estar visible. El usuario no debería dudar si está actuando sobre todos los proyectos, un contexto de organización o una campaña específica.
- Los datos deben ser trazables. Las decisiones relevantes necesitan fuente, estado, confianza o revisión visible cuando exista.
- Compliance es comportamiento de producto, no infraestructura escondida. No contactar, rebotes, duplicados, remitentes y estados de aprobación deben verse dentro del flujo.
- El modo demo debe seguir siendo útil para diseño y desarrollo local sin Supabase configurado.

## Entidades Clave

- Campaña: proyecto de prospección con organización, estado, descripción, propuesta de valor, fecha de inicio y remitente por defecto.
- Contexto: agrupación de campañas relacionadas, por ejemplo una organización o iniciativa paraguas.
- Empresa: cuenta prospecto que puede clasificarse, investigarse, deduplicarse y moverse por el pipeline.
- Contacto: persona de una empresa, con rol, email, verificación, señal de decisor, prioridad, fuente y estado de no contactar.
- Mensaje: borrador de mail saliente o follow-up con tipo, estado, remitente, cuerpo, revisión y fecha de envío.
- Respuesta: respuesta entrante que puede sincronizarse, revisarse, aprobarse y contestarse.
- Remitente: identidad de email asociada a una campaña, opcionalmente conectada a Gmail.
- Tarea/hilo de Dom: tareas y conversación del asistente con contexto de proyecto.

## Navegación Principal

- Resumen: overview de campaña, métricas, acciones rápidas, últimos mails y lista de proyectos.
- Pipeline: tablero de etapas por empresa.
- Empresas: exploración, filtros, pedidos de investigación y clasificación.
- Contactos: inventario y revisión de verificación.
- Imports: ingestión de planillas/listas y estado de batches.
- Mails: revisión, edición, aprobación, rechazo y envío de salientes.
- Respuestas: revisión y sincronización de replies.
- Dom: lista de tareas y chat de campaña.
- Remitentes: configuración de remitentes.
- Gmail: conexión y configuración de cuenta Gmail.

## Métricas de Éxito

- El usuario puede identificar trabajo pendiente de revisión en menos de 10 segundos desde el resumen.
- Ningún mail saliente se envía sin estado aprobado visible y remitente conectado.
- Las listas de empresas/contactos permiten filtrar y decidir sin volver a una planilla.
- Riesgos de duplicado, no contactar, rebote y contacto no verificado son visibles antes del outreach.
- Una campaña nueva puede avanzar desde leads importados hasta primeros mails aprobados sin salir del dashboard.

## No Objetivos

- No es una landing page pública ni un sitio para auspiciadores.
- No es un reemplazo completo de CRM.
- No es un cliente de email general.
- No es una herramienta de marketing automation que envía campañas sin revisión manual.

## Tono y Copy

- Idioma: español por defecto, directo y operativo.
- Usar etiquetas cortas: "Empresas", "Mails", "Respuestas", "Remitentes".
- Usar helper copy orientado a tarea solo cuando reduce incertidumbre.
- Evitar slogans, lenguaje promocional y explicaciones decorativas.
- Preferir estados concretos sobre ánimo genérico: "Sin mails todavía para esta vista" es mejor que "Todo listo".

## Zonas de Riesgo

- Compliance de outreach: respetar `rules/compliance.md`, `rules/do_not_contact.md` y estados de aprobación de remitentes.
- Calidad de datos: imports, dedupe, verificación y atribución de fuente deben mantenerse prominentes.
- Errores de contexto: acciones destructivas o de envío deben hacer obvio el scope de campaña/remitente.
- Confianza en IA: investigación o copy generado por IA debe tratarse como borrador hasta que alguien lo revise.

