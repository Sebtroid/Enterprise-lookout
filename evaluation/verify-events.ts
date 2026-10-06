import { strict as assert } from "node:assert";
import { CompaniesService } from "../apps/api/src/companies/companies.service";
import { LookoutService } from "../apps/api/src/lookout/lookout.service";
import { db } from "../packages/db/src/client";
import {
	contactSearchInput,
	finances,
	profileSchema,
} from "../packages/validation/src/lookout";

if (!process.env.DATABASE_URL?.includes("127.0.0.1:55439/lookout_v2_lab"))
	throw new Error("Solo base ficticia local");
const service = new LookoutService(db);
const prefix = `verify-${crypto.randomUUID()}`;
const user = `${prefix}-user`,
	company = `${prefix}-company`,
	contact = `${prefix}-contact`;
const domain = `${prefix}.invalid`,
	email = `${prefix}-contact@${domain}`;
const works: string[] = [],
	events: string[] = [];
let count = 0;
try {
	await db.user.create({
		data: {
			id: user,
			name: "Verificación temporal",
			email: `${prefix}@example.invalid`,
		},
	});
	await db.company.create({ data: { id: company, name: "Empresa temporal" } });
	await db.contact.create({
		data: {
			id: contact,
			firstName: "Contacto temporal",
			email,
			companyId: company,
		},
	});
	const contactSearch = await service.searchContacts(
		contactSearchInput.parse({ companyId: company, q: prefix }),
	);
	assert.deepEqual(contactSearch.rows.map((row) => row.id), [contact]);
	assert.equal(contactSearch.total, 1);
	assert.throws(() => contactSearchInput.parse({ companyId: company, take: 51 }));
	count++;
	const work = await service.command(user, {
		action: "createWork",
		data: { name: "Trabajo temporal", organization: "Verificación" },
	});
	works.push(work.id);
	const foreign = await service.command("demo-miguel", {
		action: "createWork",
		data: { name: "Trabajo temporal ajeno", organization: "Verificación" },
	});
	works.push(foreign.id);
	const event = await service.command(user, {
		action: "createEvent",
		workAreaId: work.id,
		data: {
			name: "Evento temporal",
			valueProposition: "Difusión de marca entre asistentes",
			startsOn: "2026-10-01T12:00:00.000Z",
			endsOn: "2026-10-31T12:00:00.000Z",
			cashTarget: 1000,
			needs: [],
			status: "planning",
		},
	});
	events.push(event.id);
	const eventBrief = (await service.snapshot(user, { workAreaId: work.id })).events[0];
	assert.equal(eventBrief?.valueProposition, "Difusión de marca entre asistentes");
	assert.equal(eventBrief?.startsOn, "2026-10-01T12:00:00.000Z");
	assert.equal(eventBrief?.endsOn, "2026-10-31T12:00:00.000Z");
	await assert.rejects(() =>
		service.command(user, {
			action: "updateEvent",
			eventId: event.id,
			data: {
				name: "Evento temporal",
				startsOn: "2026-11-01T12:00:00.000Z",
				endsOn: "2026-10-31T12:00:00.000Z",
				cashTarget: 1000,
				needs: [],
				status: "planning",
			},
		}),
	);
	count++;
	await assert.rejects(() =>
		service.command(user, {
			action: "createEvent",
			workAreaId: foreign.id,
			data: {
				name: "No permitido",
				cashTarget: 0,
				needs: [],
				status: "planning",
			},
		}),
	);
	count++;
	await assert.rejects(() =>
		service.snapshot(user, { workAreaId: foreign.id }),
	);
	count++;
	assert.equal(
		(
			await service.snapshot(user, {
				ownerId: "demo-miguel",
				workAreaId: foreign.id,
			})
		).events.length,
		0,
	);
	count++;
	const sponsor = await service.command(user, {
		action: "linkCompany",
		eventId: event.id,
		companyId: company,
		contactId: contact,
	});
	assert.equal(
		(
			await service.command(user, {
				action: "linkCompany",
				eventId: event.id,
				companyId: company,
			})
		).id,
		sponsor.id,
	);
	count++;
	for (const data of [
		{
			kind: "cash" as const,
			description: "Recibido",
			status: "received" as const,
			amount: 300,
			quantity: 1,
			unit: "pesos",
			estimatedValue: 0,
		},
		{
			kind: "cash" as const,
			description: "Propuesta",
			status: "proposed" as const,
			amount: 500,
			quantity: 1,
			unit: "pesos",
			estimatedValue: 0,
		},
		{
			kind: "product" as const,
			description: "Bebidas",
			status: "committed" as const,
			amount: 0,
			quantity: 10,
			unit: "latas",
			estimatedValue: 700,
		},
	])
		await service.command(user, {
			action: "saveContribution",
			eventId: event.id,
			sponsorshipId: sponsor.id,
			data,
		});
	const totals = finances(
		(await service.snapshot(user, { workAreaId: work.id })).events,
	);
	assert.equal(totals.received, 300);
	assert.equal(totals.committed, 300);
	assert.equal(totals.gap, 700);
	assert.equal(totals.inKind, 700);
	count++;
	const draft = await service.command(user, {
		action: "saveDraft",
		eventId: event.id,
		sponsorshipId: sponsor.id,
		subject: "Prueba",
		body: "No enviar",
	});
	await service.command(user, {
		action: "approveDraft",
		eventId: event.id,
		id: draft.id,
	});
	assert.equal(
		(await db.sponsorDraft.findUniqueOrThrow({ where: { id: draft.id } }))
			.status,
		"approved",
	);
	count++;
	await service.command(user, {
		action: "updateSponsorship",
		eventId: event.id,
		id: sponsor.id,
		contactId: null,
		stage: "candidate",
		notes: "",
		fitScore: 0,
		priority: 0,
	});
	assert.equal(
		(await db.sponsorDraft.findUniqueOrThrow({ where: { id: draft.id } }))
			.status,
		"needs_review",
	);
	count++;
	await service.command(user, {
		action: "updateSponsorship",
		eventId: event.id,
		id: sponsor.id,
		contactId: contact,
		stage: "candidate",
		notes: "",
		fitScore: 0,
		priority: 0,
	});
	await service.command(user, {
		action: "saveDraft",
		eventId: event.id,
		sponsorshipId: sponsor.id,
		id: draft.id,
		subject: "Revisado",
		body: "Nueva versión",
	});
	assert.equal(
		(await db.sponsorDraft.findUniqueOrThrow({ where: { id: draft.id } }))
			.approvedAt,
		null,
	);
	count++;
	await db.company.update({
		where: { id: company },
		data: { archivedAt: new Date() },
	});
	await assert.rejects(() =>
		service.command(user, {
			action: "approveDraft",
			eventId: event.id,
			id: draft.id,
		}),
	);
	count++;
	await db.company.update({
		where: { id: company },
		data: { archivedAt: null },
	});
	await db.contact.update({
		where: { id: contact },
		data: { archivedAt: new Date() },
	});
	await assert.rejects(() =>
		service.command(user, {
			action: "approveDraft",
			eventId: event.id,
			id: draft.id,
		}),
	);
	count++;
	await db.contact.update({
		where: { id: contact },
		data: { archivedAt: null, companyId: null },
	});
	await assert.rejects(() =>
		service.command(user, {
			action: "approveDraft",
			eventId: event.id,
			id: draft.id,
		}),
	);
	count++;
	await db.contact.update({
		where: { id: contact },
		data: { companyId: company },
	});
	await db.suppressedContact.create({
		data: { email, reason: "Prueba temporal" },
	});
	await assert.rejects(() =>
		service.command(user, {
			action: "approveDraft",
			eventId: event.id,
			id: draft.id,
		}),
	);
	count++;
	await db.suppressedContact.delete({ where: { email } });
	await db.suppressedDomain.create({
		data: { domain, reason: "Prueba temporal" },
	});
	await assert.rejects(() =>
		service.command(user, {
			action: "approveDraft",
			eventId: event.id,
			id: draft.id,
		}),
	);
	count++;
	await db.suppressedDomain.delete({ where: { domain } });
	await service.command(user, {
		action: "approveDraft",
		eventId: event.id,
		id: draft.id,
	});
	assert.equal(
		(await db.sponsorDraft.findUniqueOrThrow({ where: { id: draft.id } }))
			.status,
		"approved",
	);
	count++;
	const companies = new CompaniesService(
		db,
		null as never,
		null as never,
		null as never,
		null as never,
		null as never,
	);
	await assert.rejects(() => companies.purge(company), /participa en eventos/);
	count++;
	await service.command(user, {
		action: "saveDraft",
		eventId: event.id,
		sponsorshipId: sponsor.id,
		id: draft.id,
		subject: "Prueba bloqueo",
		body: "No enviar",
	});
	await service.command(user, {
		action: "saveProfile",
		entity: "contact",
		id: contact,
		data: profileSchema.parse({ doNotContact: true }),
	});
	await assert.rejects(() =>
		service.command(user, {
			action: "approveDraft",
			eventId: event.id,
			id: draft.id,
		}),
	);
	count++;
	console.log(
		`${count} comprobaciones correctas: separación de trabajos, consulta compartida, deduplicación, caja/canje y aprobación.`,
	);
} finally {
	await db.suppressedContact.deleteMany({ where: { email } });
	await db.suppressedDomain.deleteMany({ where: { domain } });
	const filter = { sponsorship: { eventId: { in: events } } };
	await db.sponsorDraft.deleteMany({ where: filter });
	await db.sponsorBenefit.deleteMany({ where: filter });
	await db.contribution.deleteMany({ where: filter });
	await db.budgetLine.deleteMany({ where: { eventId: { in: events } } });
	await db.sponsorship.deleteMany({ where: { eventId: { in: events } } });
	await db.sponsorEvent.deleteMany({ where: { id: { in: events } } });
	await db.workArea.deleteMany({ where: { id: { in: works } } });
	await db.contact.deleteMany({ where: { id: contact } });
	await db.company.deleteMany({ where: { id: company } });
	await db.user.deleteMany({ where: { id: user } });
	await db.$disconnect();
}
