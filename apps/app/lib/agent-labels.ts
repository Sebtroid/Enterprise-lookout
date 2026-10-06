const LABELS: Record<string, string> = {
	DRAFT: "Borrador",
	DEPLOYING: "Activando",
	LIVE: "Activo",
	PAUSED: "En pausa",
	ARCHIVED: "Archivado",
	DELETED: "Eliminado",
	READY: "Listo",
	QUEUED: "En cola",
	RUNNING: "En curso",
	WAITING_FOR_APPROVAL: "Esperando aprobación",
	SUCCEEDED: "Completada",
	FAILED: "Falló",
	CANCELLED: "Cancelada",
	MANUAL: "Manual",
	SCHEDULE: "Programada",
	EVENT: "Por evento",
	WEBHOOK: "Por notificación externa",
};

export function agentLabel(value: string): string {
	return (
		LABELS[value] ??
		value
			.toLowerCase()
			.replace(/_/g, " ")
			.replace(/^./, (character) => character.toUpperCase())
	);
}
