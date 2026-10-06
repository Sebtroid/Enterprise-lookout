import { db } from "../packages/db/src/client";
if(!process.env.DATABASE_URL?.includes('@127.0.0.1:55439/lookout_v2_lab?'))throw new Error('Solo base local.');
for(const [id,name,organization,ownerId] of [['demo-rrff','Recursos Financieros','Centro de Alumnos · UANDES','demo-seba'],['demo-federacion','Federación','UANDES · ejemplo','demo-seba'],['demo-uc-work','Trabajo País','UC','demo-miguel']]) {
 await db.workArea.upsert({where:{id},create:{id:id!,name:name!,organization:organization!,ownerId:ownerId!},update:{}});
}
for(const [id,name,workAreaId] of [['demo-asado-event','Asado de Ingeniería · DEMO','demo-rrff'],['demo-uc-event','Encuentro universitario · DEMO','demo-uc-work']]) {
 await db.sponsorEvent.upsert({where:{id},create:{id:id!,name:name!,workAreaId:workAreaId!,description:'Evento ficticio para probar la gestión de auspicios.',cashTarget:600000,needs:['Bebidas','Alimentos'],audience:'180 asistentes',status:'planning'},update:{}});
 await db.sponsorship.upsert({where:{id:`sponsor-${id}`},create:{id:`sponsor-${id}`,eventId:id!,companyId:'demo-brisa',contactId:'demo-camila',stage:'ready'},update:{}});
}
await db.company.update({where:{id:'demo-brisa'},data:{sponsorshipProfile:{categories:['Bebidas'],globalNotes:'Marca ficticia para validar la base compartida.',qualityRating:3}}});
for(const [id,description,planned] of [['demo-food','Comida',540000],['demo-drink','Bebidas',180000],['demo-production','Producción',180000]] as const)await db.budgetLine.upsert({where:{id},create:{id,eventId:'demo-asado-event',description,category:description,planned},update:{}});
await db.contribution.upsert({where:{id:'demo-cash'},create:{id:'demo-cash',sponsorshipId:'sponsor-demo-asado-event',kind:'cash',description:'Aporte económico propuesto',amount:200000,status:'proposed'},update:{}});
await db.contribution.upsert({where:{id:'demo-cans'},create:{id:'demo-cans',sponsorshipId:'sponsor-demo-asado-event',kind:'product',description:'Bebidas sin alcohol',quantity:180,unit:'latas',estimatedValue:180000,status:'proposed'},update:{}});
await db.sponsorDraft.upsert({where:{id:'demo-event-draft'},create:{id:'demo-event-draft',sponsorshipId:'sponsor-demo-asado-event',subject:'Colaboración para el Asado de Ingeniería · DEMO',body:'Hola Camila: nos gustaría conversar sobre una colaboración para el asado. Este correo es ficticio y no debe enviarse.'},update:{}});
await db.appSetting.upsert({where:{id:'app'},create:{id:'app',reportingCurrency:'CLP'},update:{reportingCurrency:'CLP'}});
console.log({works:await db.workArea.count(),events:await db.sponsorEvent.count(),sponsorships:await db.sponsorship.count()});await db.$disconnect();
