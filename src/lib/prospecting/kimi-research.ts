export const kimiDeepResearchJobName = "kimi-deep-research-companies";

export function getKimiDeepResearchInstructions() {
  return [
    "Usar investigación profunda cuando el usuario pida empresas por rubro; no devolver listas genéricas.",
    "Prioridad 1: buscar empresas nuevas útiles para el proyecto.",
    "Prioridad 2: revisar empresas existentes de la base y sugerir cuáles pueden servir.",
    "Guardar descripción breve de cada empresa, rubro, dominio, evidencia pública y razón de fit específica.",
    "Crear contactos como unverified con baja confianza inicial; no marcarlos verified ni decisor/importante hasta respuesta real.",
    "Si un contacto responde, marcar verification_status=verified, verified_at y subir confianza.",
    "Si un contacto rebota, marcar bounced y crear un nuevo borrador con otro patrón de email en mail nuevo, sin reutilizar thread_id.",
    "No inventar evidencia, cargos, emails ni relaciones previas.",
  ];
}
