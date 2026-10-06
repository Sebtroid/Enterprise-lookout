import { z } from "zod";

export const categories = [
	"Bebidas",
	"Alimentos",
	"Vestuario",
	"Deporte",
	"Transporte",
	"Tecnología",
	"Salud y bienestar",
	"Producción",
	"Servicios",
	"Dinero",
	"Otros",
] as const;
export const stages = {
	candidate: "Candidata",
	researching: "Investigando",
	ready: "Por contactar",
	contacted: "Contactada",
	negotiating: "En conversación",
	confirmed: "Confirmada",
	completed: "Finalizada",
	rejected: "No resultó",
} as const;
export const stageSchema = z.enum([
	"candidate",
	"researching",
	"ready",
	"contacted",
	"negotiating",
	"confirmed",
	"completed",
	"rejected",
]);
const text = z.string().trim().max(5000);
const id = z.string().min(1).max(160);
const money = z.number().int().min(0).max(2_000_000_000);
const date = z.string().datetime().nullable();
const optionalDate = date.optional();
export const profileSchema = z.object({
	categories: z.array(z.enum(categories)).default([]),
	globalNotes: text.default(""),
	qualityRating: z.number().int().min(1).max(5).default(3),
	qualityNotes: text.default(""),
	region: text.default(""),
	doNotContact: z.boolean().default(false),
	verificationStatus: z
		.enum(["unverified", "verified", "risky", "invalid"])
		.default("unverified"),
	source: text.default(""),
	confidence: z.number().min(0).max(1).default(0),
	verifiedAt: date.default(null),
	lastBouncedAt: date.default(null),
	bounceCount: z.number().int().min(0).default(0),
	isDecisionMaker: z.boolean().default(false),
	contactCategory: text.default(""),
	legacyId: text.default(""),
});
export const workInput = z.object({
	name: text.min(1).max(160),
	organization: text.min(1).max(160),
	description: text.optional(),
});
export const eventInput = z.object({
	name: text.min(1).max(160),
	description: text.optional(),
	valueProposition: text.optional(),
	date: optionalDate,
	startsOn: optionalDate,
	endsOn: optionalDate,
	location: text.optional(),
	audience: text.optional(),
	cashTarget: money.default(0),
	needs: z.array(z.enum(categories)).default([]),
	status: z
		.enum(["planning", "active", "completed", "archived"])
		.default("planning"),
});
export const contributionInput = z
	.object({
		kind: z.enum(["cash", "product", "service"]),
		description: text.min(1),
		status: z.enum(["proposed", "committed", "received", "cancelled"]),
		amount: money.default(0),
		quantity: z.number().int().min(1).max(1000000).default(1),
		unit: text.max(80).default("unidades"),
		estimatedValue: money.default(0),
	})
	.superRefine((v, ctx) => {
		if (v.kind !== "cash" && v.amount !== 0)
			ctx.addIssue({
				code: "custom",
				message: "Los productos y servicios no se suman a caja.",
				path: ["amount"],
			});
	});
export const budgetInput = z.object({
	description: text.min(1),
	category: text.min(1),
	planned: money,
	actual: money,
	paid: z.boolean(),
});
export const snapshotInput = z.object({
	ownerId: id.optional(),
	workAreaId: id.optional(),
});
export const operationsInput = snapshotInput.extend({ eventId: id.optional() });
export const operationsOutput = z.object({
	work: z
		.object({ id, name: z.string(), organization: z.string(), ownerId: id })
		.nullable(),
	canEdit: z.boolean(),
	generatedAt: z.string().datetime(),
	counts: z.object({
		followups: z.number().int(),
		drafts: z.number().int(),
		ready: z.number().int(),
		benefits: z.number().int(),
	}),
	tasks: z.array(
		z.object({
			id,
			kind: z.enum(["followup", "draft", "benefit", "ready"]),
			title: z.string(),
			companyName: z.string(),
			eventId: id,
			eventName: z.string(),
			dueAt: date,
		}),
	),
	inbox: z.object({
		visible: z.boolean(),
		connected: z.boolean(),
		email: z.string().nullable(),
		status: z.string().nullable(),
		lastSyncedAt: date,
		messages: z.array(
			z.object({
				id,
				threadId: id,
				subject: z.string(),
				snippet: z.string(),
				from: z.string(),
				companyName: z.string().nullable(),
				receivedAt: z.string().datetime(),
			}),
		),
	}),
	note: z.string(),
});
export type Operations = z.infer<typeof operationsOutput>;
export const chatScopeSchema = z.object({
	ownerId: id,
	workAreaId: id,
	eventId: id.optional(),
});
export type ChatScope = z.infer<typeof chatScopeSchema>;
export const chatScopeMessageSchema = z.object({
	lookoutScope: chatScopeSchema.optional(),
});
export const runtimeStatusOutput = z.object({
	model: z.string(),
	configured: z.boolean(),
	agentAvailable: z.boolean(),
});
export const commandInput = z.discriminatedUnion("action", [
	z.object({ action: z.literal("createWork"), data: workInput }),
	z.object({ action: z.literal("updateWork"), id, data: workInput }),
	z.object({
		action: z.literal("createEvent"),
		workAreaId: id,
		data: eventInput,
	}),
	z.object({ action: z.literal("updateEvent"), eventId: id, data: eventInput }),
	z.object({
		action: z.literal("linkCompany"),
		eventId: id,
		companyId: id,
		contactId: id.optional(),
	}),
	z.object({
		action: z.literal("updateSponsorship"),
		eventId: id,
		id,
		stage: stageSchema,
		notes: text,
		lastContactedAt: optionalDate,
		nextFollowupAt: optionalDate,
		fitScore: z.number().int().min(0).max(100),
		priority: z.number().int().min(0).max(100),
		selectedContactReason: text.optional(),
		futureNotes: text.optional(),
		contactId: id.nullable().optional(),
	}),
	z.object({
		action: z.literal("saveContribution"),
		eventId: id,
		sponsorshipId: id,
		id: id.optional(),
		data: contributionInput,
	}),
	z.object({
		action: z.literal("saveBudget"),
		eventId: id,
		id: id.optional(),
		data: budgetInput,
	}),
	z.object({
		action: z.literal("saveBenefit"),
		eventId: id,
		sponsorshipId: id,
		id: id.optional(),
		description: text.min(1),
		dueAt: optionalDate,
		status: z.enum(["pending", "done"]),
	}),
	z.object({
		action: z.literal("saveDraft"),
		eventId: id,
		sponsorshipId: id,
		id: id.optional(),
		subject: text.min(1),
		body: text.min(1),
	}),
	z.object({ action: z.literal("approveDraft"), eventId: id, id }),
	z.object({
		action: z.literal("saveProfile"),
		entity: z.enum(["company", "contact"]),
		id,
		data: profileSchema,
	}),
]);
export const companyOutput = z.object({
	id,
	name: z.string(),
	domain: z.string().nullable(),
	industry: z.string().nullable(),
	sponsorshipProfile: z.json().nullable(),
});
export const contactOutput = z.object({
	id,
	firstName: z.string(),
	lastName: z.string().nullable(),
	email: z.string().nullable(),
	companyId: id.nullable(),
	sponsorshipProfile: z.json().nullable(),
});
export const sponsorshipOutput = z.object({
	id,
	eventId: id,
	companyId: id,
	contactId: id.nullable(),
	stage: stageSchema,
	fitScore: z.number(),
	priority: z.number(),
	notes: z.string().nullable(),
	nextFollowupAt: date,
	lastContactedAt: date,
	selectedContactReason: z.string().nullable(),
	futureNotes: z.string().nullable(),
	company: companyOutput,
	contact: contactOutput.nullable(),
	contributions: z.array(
		contributionInput.safeExtend({ id, receivedAt: date }),
	),
	benefits: z.array(
		z.object({ id, description: z.string(), dueAt: date, status: z.string() }),
	),
	drafts: z.array(
		z.object({
			id,
			subject: z.string(),
			body: z.string(),
			status: z.string(),
			approvedBy: z.string().nullable(),
			approvedAt: date,
			sentAt: date,
			gmailThreadId: z.string().nullable(),
			senderEmail: z.string().nullable(),
			recipientEmail: z.string().nullable(),
			sendError: z.string().nullable(),
		}),
	),
});
export const mailboxStatusOutput = z.object({
	configured: z.boolean(),
	connected: z.boolean(),
	email: z.string().nullable(),
	canSend: z.boolean(),
	canRead: z.boolean(),
});
export const mailboxConnectInput = z.object({ email: z.email().max(254) });
export const mailboxConnectOutput = z.object({ url: z.url() });
export const sendDraftInput = z.object({
	id,
	eventId: id,
	senderEmail: z.email(),
});
export const sendDraftOutput = z.object({
	id,
	status: z.enum(["sent", "send_uncertain"]),
	message: z.string(),
});
export const eventOutput = eventInput.extend({
	id,
	workAreaId: id,
	date,
	startsOn: date,
	endsOn: date,
	description: z.string().nullable(),
	valueProposition: z.string().nullable(),
	location: z.string().nullable(),
	audience: z.string().nullable(),
	sponsorships: z.array(sponsorshipOutput),
	budget: z.array(budgetInput.extend({ id })),
});
export const workOutput = workInput.extend({
	id,
	ownerId: id,
	description: z.string().nullable(),
});
export const snapshotOutput = z.object({
	userId: id,
	users: z.array(z.object({ id, name: z.string() })),
	workAreas: z.array(workOutput),
	selectedWork: workOutput.nullable(),
	events: z.array(eventOutput),
	companies: z.array(companyOutput),
	contacts: z.array(contactOutput),
	companyCount: z.number(),
	storage: z.enum(["supabase", "local"]),
});
export const commandOutput = z.object({ ok: z.literal(true), id });
export const profileInput = z.object({
	entity: z.enum(["company", "contact"]),
	id,
});
export const contactSearchInput = z.object({
	companyId: id,
	q: z.string().trim().max(160).default(""),
	take: z.number().int().min(1).max(50).default(50),
});
export const contactSearchOutput = z.object({
	rows: z.array(contactOutput),
	total: z.number().int().min(0),
});
export type Snapshot = z.infer<typeof snapshotOutput>;
export type SponsorEvent = z.infer<typeof eventOutput>;
export type Sponsorship = z.infer<typeof sponsorshipOutput>;
export type Command = z.infer<typeof commandInput>;
export type SponsorProfile = z.infer<typeof profileSchema>;
export function profileOf(
	value: z.infer<ReturnType<typeof z.json>> | null | undefined,
): SponsorProfile {
	return profileSchema.parse(value ?? {});
}
export function finances(events: SponsorEvent[]) {
	const lines = events.flatMap((e) =>
		e.sponsorships.flatMap((s) => s.contributions),
	);
	const cash = (statuses: string[]) =>
		lines
			.filter((c) => c.kind === "cash" && statuses.includes(c.status))
			.reduce((sum, c) => sum + c.amount, 0);
	const received = cash(["received"]);
	const committed = cash(["committed", "received"]);
	const target = events.reduce((sum, e) => sum + e.cashTarget, 0);
	const budget = events.flatMap((e) => e.budget);
	return {
		target,
		committed,
		received,
		gap: Math.max(0, target - committed),
		planned: budget.reduce((s, b) => s + b.planned, 0),
		actual: budget.reduce((s, b) => s + b.actual, 0),
		paid: budget.filter((b) => b.paid).reduce((s, b) => s + b.actual, 0),
		inKind: lines
			.filter(
				(c) =>
					c.kind !== "cash" && ["committed", "received"].includes(c.status),
			)
			.reduce((s, c) => s + c.estimatedValue, 0),
	};
}

export const actionInput = z.object({ command: commandInput });

export const usageInput = profileInput.extend({
	page: z.number().int().min(1).default(1),
});
export const usageOutput = z.object({
	total: z.number(),
	rows: z.array(
		z.object({
			id,
			eventId: id,
			eventName: z.string(),
			workId: id,
			workName: z.string(),
			ownerId: id,
			ownerName: z.string(),
			stage: stageSchema,
			eventStatus: z.string(),
		}),
	),
});
