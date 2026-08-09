# Flujos de herramientas

## Investigación aprobada

1. `list_approved_research`
2. `get_project_context`
3. Investigar web pública y fuentes oficiales.
4. `save_research_report` con al menos una fuente.
5. `propose_fact` por cada dato candidato que deba entrar a la ficha maestra.
6. `complete_job` como `completed` o `failed`.

El informe puede sugerir contactos y estrategia, pero los datos maestros quedan pendientes de revisión humana.

## Descubrimiento superficial

1. `get_project_context`
2. Buscar candidatos plausibles y al menos una fuente pública por candidato.
3. `save_research_candidates`

Detenerse ahí: seleccionar candidatos y aprobar profundidad corresponde al usuario en la aplicación.

## Respuesta de correo

1. `get_project_context`
2. `analyze_reply`
3. Redactar una respuesta corta que conteste primero las preguntas recibidas.
4. `upsert_draft` con tipo `reply`.

El resultado correcto es un borrador en revisión, no un correo enviado.

## Feedback humano

Usar `save_feedback` solo cuando el usuario formule o apruebe una regla explícita. No inferir reglas permanentes a partir de una edición aislada.
