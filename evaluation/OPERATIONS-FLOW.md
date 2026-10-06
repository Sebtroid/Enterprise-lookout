# Dom como centro operativo

Objetivo: abrir la app, saber qué hacer hoy y avanzar la búsqueda de auspicios conversando, con el trabajo y evento siempre visibles.

Flujo actual:
```text
Abrir app → tablero de eventos
└─ Abrir Chat → escribir una consulta
   └─ Dom consulta eventos y prepara un borrador pendiente de revisión
```

Flujo esperado:
```text
Abrir app → Dom + trabajo seleccionado
├─ Revisar pendientes → seguimientos próximos, borradores y compromisos
├─ Revisar recibidos → correo propio relacionado con empresas del contexto
└─ Pedir marcas de una categoría → buscar fuentes y reutilizar la base compartida
   └─ Elegir evento → guardar candidatas sin duplicar empresas
      └─ Preparar correos → revisión humana → envío manual
```

La API y el paquete de base de datos calculan el resumen sin IA. El agente interpreta la petición, investiga con GLM y ejecuta herramientas limitadas al trabajo propio. La interfaz muestra resultados, vacíos y fallos reales; ninguna ausencia de correo significa que no existan correos en Gmail. Los mensajes con la misma empresa pueden pertenecer a varias campañas, por lo que no se atribuyen automáticamente a un evento.

Anclas: `readLookoutOperations`, `lookout.operations`, `lookout_operations`, `search_sponsorship_companies`, `add_sponsorship_candidate`, `prepare_sponsorship_draft`, `AgentBuilderHome`. Se reutilizan el chat persistente, sus eventos en vivo, los componentes compartidos y la aprobación existente.

Decisiones: Dom es el inicio; Eventos conserva el tablero; Custom GPT queda fuera del alcance actual. La lectura de Gmail exige conectar la casilla remitente. Vercel se prepara con tres servicios y sincronización diaria/manual compatible con Hobby. Las pruebas cubrirán aislamiento, deduplicación y ausencia de envíos desde el agente.
