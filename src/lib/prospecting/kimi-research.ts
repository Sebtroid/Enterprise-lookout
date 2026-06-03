export const kimiDeepResearchJobName = "kimi-deep-research-companies";

export function getKimiDeepResearchInstructions() {
  return [
    "Usar investigación profunda cuando el usuario pida empresas por rubro; no devolver listas genéricas.",
    "Prioridad 1: buscar empresas nuevas útiles para el proyecto.",
    "Prioridad 2: revisar empresas existentes de la base y sugerir cuáles pueden servir.",
    "Guardar descripción breve de cada empresa, rubro, dominio, evidencia pública y razón de fit específica.",
    "Para cada empresa prioritaria, buscar primero personas concretas: gerente/director/jefe de asuntos corporativos, sostenibilidad/RSE/ESG, comunicaciones, fundación, marketing, partnerships o gerencia general.",
    "No priorizar mails genéricos como info@, contacto@, ventas@, marketing@ o comunicaciones@ para outreach masivo; usarlos solo como evidencia secundaria o fallback explícito.",
    "Si el mail de una persona aparece publicado con fuente clara, guardar el contacto con source URL o descripción precisa de la fuente; si el mail se infiere por patrón, guardar source='email_pattern_inferred:<patrón>' y verification_status='unverified'.",
    "Crear contactos como unverified hasta que exista verificación externa o respuesta real; no marcarlos verified ni decisor/importante sin evidencia de cargo o respuesta real.",
    "Si un contacto responde, marcar verification_status=verified, verified_at y subir confianza.",
    "Si un contacto rebota, marcar bounced y pedir investigación de otro contacto; no probar varios patrones enviando correos reales desde Gmail.",
    "No inventar evidencia, cargos, emails ni relaciones previas.",
  ];
}
