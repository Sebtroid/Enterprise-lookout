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

