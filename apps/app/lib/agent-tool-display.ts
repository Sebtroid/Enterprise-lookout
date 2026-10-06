import {
	type EveToolFields,
	type EveToolInput,
	eveToolText,
} from "@crm/validation/eve-tool";

type ArtifactNames = Record<string, string>;

const ARTIFACT_NAMES: ArtifactNames = {
	"agent/instructions.md": "instrucciones",
	"agent/manifest.json": "configuración",
	"agent/README.md": "documentación",
};

type LabelInput = {
	tool: string;
	input: EveToolInput;
	label: string;
	pending: boolean;
};

type ToolInputLabel = (input: EveToolFields, pending: boolean) => string | null;

type ToolInputLabels = Record<string, ToolInputLabel>;

const ACTION_LABELS: Record<string, readonly [string, string]> = {
	lookout_operations: [
		"Revisando pendientes y correos",
		"Pendientes y correos revisados",
	],
	search_sponsorship_companies: [
		"Buscando marcas y fuentes",
		"Búsqueda de marcas terminada",
	],
	add_sponsorship_candidate: [
		"Agregando empresa al evento",
		"Empresa agregada al evento",
	],
	create_sponsorship_event: ["Creando evento", "Evento creado"],
	schedule_sponsorship_followup: [
		"Programando seguimiento",
		"Seguimiento programado",
	],
	save_sponsorship_contact: ["Guardando contacto", "Contacto guardado"],
	read_sponsorship_email: [
		"Consultando correo recibido",
		"Correo recibido consultado",
	],
	prepare_sponsorship_draft: [
		"Preparando borrador para revisión",
		"Borrador preparado para revisión",
	],
	lookout_context: [
		"Consultando contexto del trabajo",
		"Contexto del trabajo consultado",
	],
};

const INPUT_LABELS: ToolInputLabels = {
	write_agent_file: (input, pending) => {
		const path = eveToolText.parse(input.path);
		if (!path) return null;
		const name = ARTIFACT_NAMES[path] ?? path;
		return pending ? `Escribiendo ${name}` : `Guardado: ${name}`;
	},
	save_agent_draft: (input, pending) => {
		const name = eveToolText.parse(input.name).trim();
		const verb = pending ? "Guardando borrador" : "Borrador guardado";
		return name ? `${verb} · ${name}` : verb;
	},
	set_chat_title: (input, pending) => {
		const title = eveToolText.parse(input.title).trim();
		const verb = pending ? "Nombrando conversación" : "Conversación nombrada";
		return title ? `${verb} · ${title}` : verb;
	},
};

export function toolLabel(item: LabelInput): string {
	const action = ACTION_LABELS[item.tool];
	if (action) return action[item.pending ? 0 : 1];
	const fromInput = item.input
		? INPUT_LABELS[item.tool]?.(item.input, item.pending)
		: null;
	return fromInput ?? item.label;
}
