import { db } from "../packages/db/src/client";
import scenario from "./scenario.json";

const connection = new URL(process.env.DATABASE_URL ?? "");
if (connection.hostname !== "127.0.0.1" || connection.port !== "55439" || connection.pathname !== "/lookout_v2_lab") {
  throw new Error("This fixture only runs against the isolated Lookout laboratory.");
}

await db.$transaction(async (tx) => {
  for (const [id, name, email] of [
    ["demo-seba", "Sebastián · DEMO", "seba@example.invalid"],
    ["demo-miguel", "Miguel · DEMO", "miguel@example.invalid"],
  ]) {
    await tx.user.upsert({ where: { id }, create: { id, name, email, emailVerified: true, updatedAt: new Date() }, update: {} });
  }
  await tx.organization.upsert({
    where: { id: "workspace" },
    create: { id: "workspace", name: "Lookout · Laboratorio", slug: "lookout-lab", createdAt: new Date(), metadata: JSON.stringify({onboardedAt: new Date().toISOString()}) },
    update: {},
  });
  for (const userId of ["demo-seba", "demo-miguel"]) {
    await tx.member.upsert({ where: { id: `member-${userId}` }, create: { id: `member-${userId}`, organizationId: "workspace", userId, role: "owner", createdAt: new Date() }, update: {} });
  }
  await tx.company.upsert({ where: { id: "demo-brisa" }, create: { id: "demo-brisa", name: scenario.company.name, domain: scenario.company.domain, industry: "Bebidas", country: "Chile", ownerId: "demo-seba", description: "Empresa ficticia compartida por dos proyectos. No contactar.", enrichmentStatus: "COMPLETE" }, update: {} });
  await tx.contact.upsert({ where: { id: "demo-camila" }, create: { id: "demo-camila", firstName: "Camila", lastName: "Demo", email: scenario.contact.email, companyId: "demo-brisa", title: "Encargada de auspicios · FICTICIA", ownerId: "demo-seba", enrichmentStatus: "COMPLETE" }, update: {} });
  for (const [id, ownerId, name] of [
    ["demo-asado", "demo-seba", "Asado de Ingeniería · DEMO"],
    ["demo-uc", "demo-miguel", "Encuentro universitario UC · DEMO"],
  ]) {
    await tx.deal.upsert({ where: { id }, create: { id, name, ownerId, companyId: "demo-brisa", stage: "DEMO_BOOKED", description: "Representación provisional de una oportunidad de auspicio. El CRM todavía no tiene proyectos ni presupuestos de eventos. Importes CLP en la nota, sin conversión a USD." }, update: {} });
  }
  for (const dealId of ["demo-asado", "demo-uc"]) {
    await tx.dealContact.upsert({where:{dealId_contactId:{dealId,contactId:"demo-camila"}},create:{dealId,contactId:"demo-camila",role:"Contacto de auspicios · DEMO"},update:{}});
  }
  await tx.activity.upsert({ where: { id: "demo-budget" }, create: { id: "demo-budget", type: "NOTE", subject: "Escenario ficticio · Presupuesto y canje", body: "Presupuesto: $900.000 CLP. Meta de auspicios monetarios: $600.000 CLP. Propuesta: $200.000 CLP + 180 latas valorizadas en $180.000 CLP. Comprometido: $0. Recibido: $0. Canje pendiente. No sumar productos a caja. Estos valores son una nota de evaluación, no un módulo financiero implementado.", companyId: "demo-brisa", dealId: "demo-asado", createdById: "demo-seba" }, update: {} });
  await tx.activity.upsert({ where: { id: "demo-draft" }, create: { id: "demo-draft", type: "NOTE", subject: scenario.outbound.subject, body: `BORRADOR DE PRUEBA · PENDIENTE DE APROBACIÓN\n\n${scenario.outbound.body}`, companyId: "demo-brisa", contactId: "demo-camila", dealId: "demo-asado", createdById: "demo-seba" }, update: {} });
});
console.log(JSON.stringify({ companies: await db.company.count(), contacts: await db.contact.count(), deals: await db.deal.count(), activities: await db.activity.count() }));
await db.$disconnect();
