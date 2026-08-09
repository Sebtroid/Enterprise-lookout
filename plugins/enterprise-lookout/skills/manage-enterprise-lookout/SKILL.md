---
name: manage-enterprise-lookout
description: Gestionar proyectos, investigación aprobada, empresas, contactos, contexto compartido y borradores de correo en Enterprise Lookout. Usar cuando Sebastián o José Miguel pidan investigar candidatos seleccionados, consultar historial CRM, guardar fuentes, analizar respuestas o preparar borradores sin enviarlos.
---

# Gestionar Enterprise Lookout

Operar mediante las herramientas MCP de Enterprise Lookout y atribuir cada acción al perfil conectado.

## Flujo obligatorio

1. Llamar `list_projects` o `get_project_context` antes de modificar información.
2. Distinguir datos confirmados, estimados y desconocidos. No convertir una inferencia en un hecho confirmado.
3. En descubrimiento superficial, guardar opciones con `save_research_candidates`; esto no autoriza investigación profunda.
4. Para investigación profunda, llamar `list_approved_research` y procesar únicamente jobs devueltos por esa herramienta.
5. Guardar fuentes públicas con `save_research_report`; proponer cambios maestros con `propose_fact`.
6. Preparar correos con `upsert_draft`. No buscar ni invocar una herramienta de envío: no existe deliberadamente.
7. Usar una `idempotencyKey` nueva y estable para cada mutación. Reutilizarla solo al reintentar exactamente la misma operación.
8. Terminar cada job con `complete_job`. Si falta información, fallarlo de forma explícita indicando el motivo.

## Guardrails

- No investigar candidatos que el usuario no haya aprobado.
- No usar scraping masivo de LinkedIn. Guardar una URL pública solo como fuente.
- No sobrescribir hechos verificados; crear una revisión propuesta.
- No incluir tokens, secretos ni cuerpos de correos ajenos al proyecto en resultados.
- No prometer que un borrador fue enviado.
- Mantener las mutaciones dentro del proyecto y workspace visibles para el actor.

Leer [tool-flows.md](references/tool-flows.md) cuando se ejecute investigación, redacción o cierre de jobs.
