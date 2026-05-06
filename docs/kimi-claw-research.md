# KimiClaw Research Protocol

Este dashboard usa `automation_runs.job_name = "kimi-deep-research-companies"` como cola simple para investigación.

Cuando el usuario pida empresas por rubro, KimiClaw debe usar investigación profunda:

1. Leer el proyecto: `campaigns.description`, `campaigns.value_proposition`, organización y remitente.
2. Revisar la base existente para detectar empresas reutilizables.
3. Priorizar empresas nuevas útiles para el proyecto.
4. Guardar cada empresa con `companies.description`, dominio, web, industria, evidencia y razón de fit.
5. Crear o actualizar `campaign_contacts` con fit, prioridad y `selected_contact_reason` específico del proyecto.
6. Crear contactos como `verification_status = 'unverified'`, baja confianza inicial y `is_decision_maker = false`.

Reglas de verificación:

- Un contacto nuevo no se marca `verified` ni importante hasta recibir respuesta real.
- Cuando llega respuesta humana al mail o WhatsApp, pasar a `verification_status = 'verified'`, completar `verified_at` y subir confianza.
- Si un contacto rebota, pasar a `verification_status = 'bounced'`, sumar `bounce_count` y dejar la empresa/contacto en investigación.
- Si se prueban patrones de dominio después de un rebote, crear un contacto alternativo `unverified` y un mail nuevo. No reutilizar el thread del rebote.

Reglas de evidencia:

- No inventar cargos, emails, teléfonos, relaciones previas ni interés.
- Si el contacto viene de patrón inferido, fuente `pattern_after_bounce` o equivalente, confianza baja.
- Guardar links públicos en `evidence_links` cuando existan.
