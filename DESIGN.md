# Dirección de Diseño

## Intención

Este es un dashboard privado de operaciones para prospección de auspicios. Debe sentirse calmo, preciso y orientado al trabajo: suficientemente denso para uso repetido, suficientemente contenido para que las decisiones sean claras, y pulido sin parecer una página de marketing.

El diseño futuro debe optimizar escaneo, confianza y velocidad de acción por sobre espectáculo visual.

## Stack y Restricciones

- Framework: Next.js App Router, actualmente Next `16.2.4`.
- Estilos: Tailwind CSS v4 usando `@import "tailwindcss"` y `@theme inline`.
- Base de componentes: shadcn/ui, Base UI y componentes locales en `src/components/ui`.
- Íconos: `lucide-react` está instalado y ya se usa. Preferir lucide para navegación, herramientas, botones y señales de estado.
- Tipografía: Geist y Geist Mono ya están configuradas en `src/app/globals.css`.
- Antes de cambiar convenciones de Next.js, leer la guía relevante en `node_modules/next/dist/docs/`, como exige `AGENTS.md`.

## Personalidad Visual

- Herramienta interna sobria, no landing page.
- Profesional, compacta y confiable.
- Data-first, pero no saturada.
- Superficies muted con jerarquía clara.
- Decoración mínima. Cada elemento visual debe apoyar orientación, agrupación, estado o acción.

## Tokens Existentes

El tema actual está definido en `src/app/globals.css` con variables OKLCH.

- Fondo: off-white cálido con `--background`.
- Texto principal: blue-gray oscuro con `--foreground`.
- Primario: teal-blue profundo y muted con `--primary`.
- Secundario: cyan/teal pálido con `--secondary`.
- Acento: verde suave con `--accent`.
- Bordes/inputs: neutrales blue-gray discretos.
- Radio: base `0.5rem`. Mantener la mayoría de cards y controles en `rounded-lg` o menos salvo que un componente existente requiera más.

No introducir gradientes amplios morado/azul estilo IA, glows decorativos, blobs, paletas beige editoriales ni heroes coloridos de marketing.

## Reglas de Layout

- El shell usa sidebar fija en desktop y navegación móvil.
- El contenido principal debe mantenerse dentro del ancho existente: `max-w-[104rem]`, con padding responsive.
- Preferir layouts operativos de página completa por sobre heroes.
- Mantener estructura predecible:
  - `PageHeader` con eyebrow, título y acciones primarias.
  - Métricas o acciones rápidas cuando aporten.
  - Superficie principal: tabla, board, formulario o revisión.
  - Empty states inline dentro de la superficie correspondiente.
- Usar CSS Grid para composiciones multi-columna y dashboards estables.
- Evitar cards dentro de cards. Usar cards para ítems repetidos, superficies tipo modal o herramientas claramente delimitadas; usar bordes, divisores y espacio para agrupar lo demás.

## Patrones de Componentes

- Botones: usar variantes shadcn o variantes locales existentes. Agregar íconos cuando clarifican la acción.
- Tablas: usarlas para listas densas de empresas, contactos, imports, mensajes y proyectos. Mantener identificadores importantes a la izquierda y estados en columnas propias.
- Badges/estados: usar `StatusBadge` o `Badge` de shadcn; el estado debe verse antes de actuar.
- Formularios: labels arriba del input, helper/error text debajo, espaciado compacto y estado de envío claro.
- Navegación: etiquetas cortas y estables. El estado activo debe notarse por fondo, color de texto y ring/sombra sutil.
- Superficies de revisión: mostrar contexto, contenido del borrador, estado, remitente y acciones aprobar/rechazar/enviar sin esconder riesgos.

## Interacción

- Microinteracciones sutiles: hover de color, énfasis de borde, active scale cercano a `0.99`, fade/slide liviano al entrar listas.
- Usar skeletons que calcen con el layout final en vez de spinners genéricos cuando sea posible.
- Empty states deben decir qué falta y cuál es la próxima acción útil.
- Errores deben ser inline y específicos.
- Respetar reduced motion mediante la media query global existente.
- No agregar animación continua salvo que comunique estado vivo o progreso.

## Jerarquía de Información

- Primero contexto: campaña, organización o "Todos los proyectos" visible cerca del título.
- Luego métricas de atención: pendientes de revisión, aprobados para enviar, respuestas pendientes, empresas activas.
- Luego trabajo accionable: clasificación, aprobación, respuesta, creación de tareas.
- Metadatos secundarios como fuente, fechas, remitente y verificación deben quedar cerca de la fila u objeto que describen.

## Reglas de Copy

- UI en español por defecto.
- Usar etiquetas operativas, no lenguaje promocional.
- Mantener headings cortos.
- Preferir verbos para acciones: "Revisar mails", "Clasificar empresas", "Responder interesados".
- Usar "Dom" consistentemente para el área de asistente/tareas.
- No agregar párrafos instructivos que expliquen controles obvios.

## Accesibilidad y Responsividad

- Preservar headings, tablas, links y botones semánticos.
- Mantener focus states visibles usando los tokens de ring existentes.
- No depender solo del color para estados; acompañar color con texto.
- Hacer que nombres largos de empresas, emails, asuntos y tareas corten línea correctamente.
- Verificar pantallas compactas para reemplazo de sidebar, overflow de tablas, ajuste de texto en botones y alcance de acciones.

## Brief Para Futuras Habilidades de Diseño

Cuando se usen habilidades de diseño en este repo, partir de estas premisas:

- Construir el flujo real del dashboard, no una landing page.
- Mantener densidad media-alta para trabajo operativo.
- Usar patrones existentes de shadcn/lucide/Tailwind v4.
- Preservar la postura de compliance y aprobación del producto.
- Mejorar jerarquía, escaneo, empty states y ergonomía de revisión antes de agregar flourish visual.
- Si el cambio afecta layout compartido, navegación, estados o flujos de revisión, verificar pantallas representativas en desktop y mobile.

## Pastoral UC Cockpit

### Product Intent

Pastoral UC no es una vista de exploración general. Es un cockpit diario para recaudar plata con velocidad y bajo riesgo. La pantalla debe responder tres preguntas en menos de 10 segundos:

1. Qué puedo hacer ahora.
2. Qué está bloqueado y por qué.
3. Qué aprendió el sistema para redactar mejor la próxima vez.

### UX Principles

- Fail-closed visible: si Sheets, Gmail o duplicados están mal, el bloqueo debe verse antes de cualquier acción de envío.
- Cola primero: las métricas ayudan, pero la unidad principal es la siguiente empresa accionable.
- Ruido bajo: mostrar solo empresas aprobadas, contactadas, respondidas o con follow-up pendiente.
- Historial bajo demanda: mails, plantillas y detalles largos deben ir desplegables o truncados.
- Acción clara: cada fila accionable debe tener un botón obvio y un motivo breve.
- Autonomía gradual: la IA puede aprender y proponer, pero las respuestas a marcas siguen revisadas por humano.

### Layout

- Header: título, acceso directo a Sheets, respuestas y revisión de mails.
- Health strip: 5 tarjetas compactas para Gmail, Sheets API, duplicados, follow-ups y respuestas pendientes.
- Critical banner: regla anti-duplicados y secuencia fail-closed.
- Main grid:
  - Left: cola priorizada.
  - Right: meta de recaudación y estado de Sheets.
- Secondary grid:
  - Guardrail paso a paso.
  - Duplicados detectados.
- Learning grid:
  - Reglas activas de IA con desactivar.
  - Actividad reciente sin cargar cuerpos completos.
- Bottom:
  - Datos de donación/certificado.
  - Plantillas desplegables.
  - Empresas aprobadas/contactadas solamente.

### Visual System

- Radius: 8px máximo para paneles operativos.
- Cards: solo para herramientas discretas o registros repetidos; no cards dentro de cards.
- Palette:
  - Primary: token teal/navy existente.
  - Success: emerald para seguro.
  - Warning: amber para acción pendiente.
  - Critical: red para bloqueado.
  - Info: blue/cyan para replies y estados de revisión.
- Density: compacta, escaneable, sin hero.
- Typography:
  - Page title solo a escala grande.
  - Panel titles: equivalente a 18px.
  - Row text: 14px compacto con empresa fuerte.
- Icons: solo lucide; cada fila accionable debe tener un icono familiar.

### States

- Gmail:
  - Listo: al menos un token Gmail conectado.
  - Falta: sin token, envío bloqueado.
- Sheets:
  - Seguro: lectura exitosa con Google OAuth de una cuenta conectada.
  - Bloquea: falta reconectar Google con permiso de Sheets o hay error de API.
  - CSV público: permitido para vista, nunca para enviar.
- Duplicate:
  - 0: señal segura.
  - >0: crítico, filas explican conflicto de email/dominio/nombre.
- AI memory:
  - Reglas duras: `ai_memory_rules`, editables/desactivables.
  - Memoria semántica: `ai_memory_events` con pgvector dentro de Supabase.
  - Si falta `OPENAI_API_KEY`, se guarda el evento sin embedding y no bloquea operación.
- Queue:
  - Respondió: replies abiertos.
  - Follow-up: 5+ días sin respuesta.
  - Seguro enviar: outbound aprobado, listo para guardrail.
  - Revisar mail: falta draft/research.
  - Esperando: enviado pero no accionable.
  - Bloqueado: do_not_contact o conflicto de guardrail.

### Guardrail Contract

Orden de envío inicial Pastoral:

1. Leer Sheets fresco con la cuenta Google conectada del remitente.
2. Detectar duplicado por email, dominio corporativo y nombre normalizado.
3. Crear reserva local idempotente por email/dominio.
4. Agregar fila al Sheets antes de Gmail.
5. Releer Sheets y verificar la fila.
6. Enviar Gmail solo después de verificar.

Si cualquier paso falla, la UI/API debe mostrar el motivo de bloqueo y no enviar.

### Accessibility And Responsiveness

- Sin scroll horizontal a 390px, 1024px o 1440px.
- Botones deben mantener icono y etiqueta visibles o envolver sin solaparse.
- Estados importantes no pueden depender solo del color.
- El tab order debe alcanzar links y formularios primarios en orden de documento.
- Details/summary son aceptables para plantillas largas.

### QA Checklist

- Unit tests cubren parser de Sheets, duplicados, reservas, elegibilidad de follow-up y matching de replies.
- Memoria IA usa Postgres/pgvector como contexto, nunca para saltarse guardrails.
- Playwright verifica desktop 1440, laptop 1024 y mobile 390.
- Screenshots deben mostrar cero overflow, texto no cortado y overlays sanos.
- El build debe pasar sin credenciales de cuenta técnica; Sheets usa Google OAuth del remitente.
- Producción debe tener `PASTORAL_CONTACT_SHEET_ID/RANGE` y los remitentes deben reconectar Google con permiso de Sheets antes de habilitar envíos reales de Pastoral.
