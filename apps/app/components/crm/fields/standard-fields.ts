import type { FieldEntity } from "./fields-entity";

export const STANDARD_FIELDS = {
	COMPANY: [
		"Nombre",
		"Dominio",
		"Sitio web",
		"Teléfono",
		"Correo",
		"Ciudad",
		"País",
		"Responsable",
	],
	CONTACT: [
		"Nombre",
		"Apellido",
		"Cargo",
		"Correo",
		"Teléfono",
		"LinkedIn",
		"GitHub",
		"Empresa",
		"Responsable",
	],
	DEAL: [
		"Nombre",
		"Monto",
		"Moneda",
		"Fecha de cierre",
		"Empresa",
		"Responsable",
		"Etapa",
	],
} satisfies Record<FieldEntity, readonly string[]>;
