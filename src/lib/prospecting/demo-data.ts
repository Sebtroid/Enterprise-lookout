import { scoreContactPriority } from "./dedupe";

export type AppCampaign = {
  id: string;
  name: string;
  organization: string;
  description: string;
  status: "draft" | "active" | "paused" | "archived";
  valueProposition: string;
  startsOn: string;
};

export type AppSender = {
  id: string;
  campaignId: string;
  email: string;
  displayName: string;
  organization: string;
  accountType: "gmail" | "outlook" | "smtp" | "manual";
  status: "active" | "paused" | "disabled";
  isDefault: boolean;
  priority: number;
  dailyLimit: number;
  campaignDailyLimit: number;
  sentToday: number;
  signature: string;
};

export type AppCompany = {
  id: string;
  campaignIds: string[];
  name: string;
  domain: string | null;
  website: string | null;
  industry: string;
  region: string;
  description: string;
  fitScore: number;
  status:
    | "new"
    | "needs_research"
    | "qualified"
    | "ready_to_draft"
    | "draft_ready"
    | "approved_to_send"
    | "sent"
    | "replied"
    | "followup_due"
    | "closed_positive"
    | "closed_negative";
  notes: string;
  campaignNotes?: string;
  futureNotes?: string;
  selectedContactReason?: string;
  lastContactedAt?: string | null;
  doNotContact: boolean;
  evidenceUrls: string[];
};

export type AppContact = {
  id: string;
  companyId: string;
  name: string;
  role: string;
  email: string;
  phone: string | null;
  category: string;
  confidence: number;
  verificationStatus: "unverified" | "verified" | "bounced" | "invalid";
  verifiedAt: string | null;
  bounceCount: number;
  source: string;
  isDecisionMaker: boolean;
  doNotContact: boolean;
  notes: string;
};

export type AppMessage = {
  id: string;
  campaignId: string;
  companyId: string;
  contactId: string;
  senderId: string;
  kind: "outbound_initial" | "outbound_followup" | "outbound_reply";
  status: "needs_review" | "approved" | "rejected" | "sent" | "failed";
  subject: string;
  body: string;
  futureNote?: string;
  createdAt: string;
  sentAt: string | null;
};

export type AppReply = {
  id: string;
  messageId: string;
  companyId: string;
  contactId: string;
  senderId: string;
  classification: "interested" | "needs_info" | "referred" | "not_now" | "bounced";
  receivedAt: string;
  body: string;
  draftResponse: string;
  approvalStatus: "needs_review" | "approved" | "rejected";
  futureNote: string;
};

export type AppImportBatch = {
  id: string;
  campaignId: string | null;
  sourceName: string;
  sourceType: "notion" | "sheets" | "excel";
  status: "uploaded" | "parsed" | "needs_review" | "applied" | "failed";
  rowCount: number;
  appliedCount: number;
  duplicateCount: number;
  errorCount: number;
  createdAt: string;
};

export const campaigns: AppCampaign[] = [
  {
    id: "pastoral-invierno-2026",
    name: "Pastoral UC Invierno 2026",
    organization: "Pastoral UC / Trabajo País",
    description:
      "Proyecto social universitario de invierno con voluntarios, trabajo territorial y apoyo a comunidades.",
    status: "active",
    valueProposition:
      "Apoyar un proyecto social universitario con presencia territorial, voluntariado y conexión comunitaria.",
    startsOn: "2026-06-01",
  },
  {
    id: "caa-eventos-2026",
    name: "Eventos Centro de Alumnos 2026",
    organization: "Centro de Alumnos",
    description:
      "Portafolio de eventos estudiantiles del Centro de Alumnos con activaciones y auspicios universitarios.",
    status: "draft",
    valueProposition:
      "Auspicios para actividades estudiantiles con alta visibilidad y segmentación universitaria.",
    startsOn: "2026-08-01",
  },
];

export const senders: AppSender[] = [
  {
    id: "sender-uc",
    campaignId: "pastoral-invierno-2026",
    email: "josemigueloaguado@estudiante.uc.cl",
    displayName: "Equipo Pastoral UC",
    organization: "Pastoral UC / Trabajo País",
    accountType: "outlook",
    status: "active",
    isDefault: false,
    priority: 2,
    dailyLimit: 15,
    campaignDailyLimit: 15,
    sentToday: 0,
    signature: "Equipo Pastoral UC\nTrabajo País",
  },
  {
    id: "sender-uandes-pastoral",
    campaignId: "pastoral-invierno-2026",
    email: "sawitting@miuandes.cl",
    displayName: "Sebastian Witting",
    organization: "Pastoral UC / Trabajo País",
    accountType: "gmail",
    status: "active",
    isDefault: true,
    priority: 1,
    dailyLimit: 15,
    campaignDailyLimit: 15,
    sentToday: 0,
    signature:
      "Sebastian Witting\nCentro de Alumnos Universidad de los Andes\nApoyo Pastoral UC / Trabajo País",
  },
  {
    id: "sender-uandes",
    campaignId: "caa-eventos-2026",
    email: "sawitting@miuandes.cl",
    displayName: "Recursos Financieros CAA",
    organization: "Centro de Alumnos",
    accountType: "gmail",
    status: "paused",
    isDefault: true,
    priority: 1,
    dailyLimit: 15,
    campaignDailyLimit: 15,
    sentToday: 0,
    signature: "Jefatura de Recursos Financieros\nCentro de Alumnos",
  },
];

export const companies: AppCompany[] = [
  {
    id: "company-banco-estado",
    campaignIds: ["pastoral-invierno-2026"],
    name: "BancoEstado",
    domain: "bancoestado.cl",
    website: "https://www.bancoestado.cl",
    industry: "Servicios financieros",
    region: "RM",
    description:
      "Banco chileno con foco masivo, presencia territorial y programas de inclusión financiera.",
    fitScore: 91,
    status: "draft_ready",
    notes: "Historial de apoyo a iniciativas de inclusión y presencia territorial.",
    doNotContact: false,
    evidenceUrls: ["https://www.bancoestado.cl"],
  },
  {
    id: "company-colun",
    campaignIds: ["pastoral-invierno-2026"],
    name: "Colun",
    domain: "colun.cl",
    website: "https://www.colun.cl",
    industry: "Alimentos",
    region: "Los Ríos",
    description:
      "Cooperativa láctea chilena con presencia en regiones y productos de consumo masivo.",
    fitScore: 87,
    status: "approved_to_send",
    notes: "Buen fit territorial y reputacional para iniciativas sociales.",
    doNotContact: false,
    evidenceUrls: ["https://www.colun.cl"],
  },
  {
    id: "company-cencosud",
    campaignIds: ["pastoral-invierno-2026", "caa-eventos-2026"],
    name: "Cencosud",
    domain: "cencosud.com",
    website: "https://www.cencosud.com",
    industry: "Retail",
    region: "RM",
    description:
      "Holding regional de retail, supermercados y centros comerciales con marcas de alta visibilidad.",
    fitScore: 82,
    status: "replied",
    notes: "Interés potencial por voluntariado corporativo y comunidad.",
    doNotContact: false,
    evidenceUrls: ["https://www.cencosud.com"],
  },
  {
    id: "company-sodimac",
    campaignIds: ["pastoral-invierno-2026"],
    name: "Sodimac",
    domain: "sodimac.cl",
    website: "https://www.sodimac.cl",
    industry: "Retail construcción",
    region: "RM",
    description:
      "Retail de mejoramiento del hogar y construcción, útil para materiales, herramientas y aportes en especie.",
    fitScore: 79,
    status: "followup_due",
    notes: "Potencial para materiales, herramientas o aportes en especie.",
    doNotContact: false,
    evidenceUrls: ["https://www.sodimac.cl"],
  },
  {
    id: "company-notco",
    campaignIds: ["caa-eventos-2026"],
    name: "NotCo",
    domain: "notco.com",
    website: "https://www.notco.com",
    industry: "Alimentos / consumo",
    region: "RM",
    description:
      "Marca foodtech de consumo masivo con posicionamiento joven e innovación en alimentos.",
    fitScore: 76,
    status: "qualified",
    notes: "Buen fit para eventos universitarios y activaciones de marca.",
    doNotContact: false,
    evidenceUrls: ["https://www.notco.com"],
  },
];

export const contacts: AppContact[] = [
  {
    id: "contact-beatriz",
    companyId: "company-banco-estado",
    name: "Beatriz Rojas",
    role: "Subgerenta de Sostenibilidad",
    email: "beatriz.rojas@bancoestado.cl",
    phone: null,
    category: "Sostenibilidad",
    confidence: 0.82,
    verificationStatus: "unverified",
    verifiedAt: null,
    bounceCount: 0,
    source: "Notion histórico",
    isDecisionMaker: false,
    doNotContact: false,
    notes: "Posible decisora marcada en base antigua; falta respuesta real.",
  },
  {
    id: "contact-martin",
    companyId: "company-colun",
    name: "Martín Fernández",
    role: "Jefe de Comunicaciones Corporativas",
    email: "martin.fernandez@colun.cl",
    phone: null,
    category: "Comunicaciones",
    confidence: 0.74,
    verificationStatus: "unverified",
    verifiedAt: null,
    bounceCount: 0,
    source: "Google Sheets",
    isDecisionMaker: false,
    doNotContact: false,
    notes: "Buen cargo para derivación interna.",
  },
  {
    id: "contact-paula",
    companyId: "company-cencosud",
    name: "Paula Herrera",
    role: "Gerenta de Asuntos Corporativos",
    email: "paula.herrera@cencosud.com",
    phone: null,
    category: "Asuntos corporativos",
    confidence: 0.88,
    verificationStatus: "verified",
    verifiedAt: "2026-05-03T11:30:00.000Z",
    bounceCount: 0,
    source: "Excel eventos 2025",
    isDecisionMaker: true,
    doNotContact: false,
    notes: "Pidió más información en una campaña anterior.",
  },
  {
    id: "contact-ignacio",
    companyId: "company-sodimac",
    name: "Ignacio Valdés",
    role: "Especialista de Comunidad",
    email: "ignacio.valdes@sodimac.cl",
    phone: null,
    category: "Comunidad",
    confidence: 0.68,
    verificationStatus: "verified",
    verifiedAt: "2026-05-04T15:30:00.000Z",
    bounceCount: 0,
    source: "Investigación web",
    isDecisionMaker: false,
    doNotContact: false,
    notes: "Contacto operativo para donaciones en especie.",
  },
  {
    id: "contact-francisca",
    companyId: "company-notco",
    name: "Francisca Morales",
    role: "Brand Partnerships Manager",
    email: "francisca.morales@notco.com",
    phone: null,
    category: "Marketing",
    confidence: 0.71,
    verificationStatus: "unverified",
    verifiedAt: null,
    bounceCount: 0,
    source: "Excel eventos 2025",
    isDecisionMaker: false,
    doNotContact: false,
    notes: "Contacto más orientado a eventos y activaciones universitarias.",
  },
];

export const messages: AppMessage[] = [
  {
    id: "message-1",
    campaignId: "pastoral-invierno-2026",
    companyId: "company-banco-estado",
    contactId: "contact-beatriz",
    senderId: "sender-uandes-pastoral",
    kind: "outbound_initial",
    status: "needs_review",
    subject: "Apoyo para Pastoral UC Invierno 2026",
    body: "Hola Beatriz,\n\nSoy parte del equipo de Pastoral UC / Trabajo País. Estamos preparando la campaña de invierno 2026 y creemos que BancoEstado podría tener un buen calce por su trabajo territorial y foco social.\n\nNos gustaría explorar si existe espacio para una donación, auspicio o aporte en especie para apoyar el trabajo con comunidades durante el invierno.\n\nSi te hace sentido, ¿podríamos enviarte una breve propuesta esta semana?\n\nEquipo Pastoral UC\nTrabajo País\n\nSi no corresponde o prefieren que no volvamos a escribir, nos avisan y los sacamos de la lista.",
    createdAt: "2026-05-01T12:30:00Z",
    sentAt: null,
  },
  {
    id: "message-2",
    campaignId: "pastoral-invierno-2026",
    companyId: "company-colun",
    contactId: "contact-martin",
    senderId: "sender-uandes-pastoral",
    kind: "outbound_initial",
    status: "approved",
    subject: "Trabajo País: posible apoyo de Colun",
    body: "Hola Martín,\n\nTe escribimos desde Pastoral UC / Trabajo País. Estamos levantando apoyos para la campaña de invierno 2026 y Colun nos parece un posible aliado por su vínculo con regiones y comunidades.\n\n¿Nos podrías orientar con quién revisar una propuesta breve de apoyo o donación?\n\nEquipo Pastoral UC\nTrabajo País\n\nSi no corresponde o prefieren que no volvamos a escribir, nos avisan y los sacamos de la lista.",
    createdAt: "2026-05-01T13:05:00Z",
    sentAt: null,
  },
  {
    id: "message-3",
    campaignId: "pastoral-invierno-2026",
    companyId: "company-sodimac",
    contactId: "contact-ignacio",
    senderId: "sender-uandes-pastoral",
    kind: "outbound_followup",
    status: "sent",
    subject: "Seguimiento breve - Pastoral UC",
    body: "Hola Ignacio, te escribimos para hacer seguimiento al correo anterior.",
    createdAt: "2026-04-28T14:00:00Z",
    sentAt: "2026-04-28T15:00:00Z",
  },
  {
    id: "message-4",
    campaignId: "caa-eventos-2026",
    companyId: "company-notco",
    contactId: "contact-francisca",
    senderId: "sender-uandes",
    kind: "outbound_initial",
    status: "needs_review",
    subject: "Auspicio para eventos estudiantiles 2026",
    body: "Hola Francisca,\n\nTe escribo desde el equipo de recursos financieros del centro de alumnos. Estamos preparando eventos estudiantiles para 2026 y creemos que NotCo podría calzar bien por su foco de marca joven y activaciones universitarias.\n\n¿Te haría sentido que te enviemos una propuesta breve de auspicio o colaboración?\n\nCentro de Alumnos\n\nSi no corresponde o prefieren que no volvamos a escribir, nos avisan y los sacamos de la lista.",
    createdAt: "2026-05-01T15:00:00Z",
    sentAt: null,
  },
];

export const replies: AppReply[] = [
  {
    id: "reply-1",
    messageId: "message-3",
    companyId: "company-sodimac",
    contactId: "contact-ignacio",
    senderId: "sender-uandes-pastoral",
    classification: "needs_info",
    receivedAt: "2026-05-01T10:40:00Z",
    body: "Hola, gracias por escribir. ¿Tienen una presentación corta y monto objetivo? Lo puedo revisar internamente.",
    draftResponse:
      "Hola Ignacio,\n\nMuchas gracias por responder. Sí, tenemos una presentación breve y un resumen del monto objetivo. Te la comparto por acá y quedo atento a cualquier formato que necesiten para revisión interna.\n\nEquipo Pastoral UC",
    approvalStatus: "needs_review",
    futureNote:
      "Sodimac pidió presentación y monto objetivo; útil para futuras campañas con aportes en especie.",
  },
];

export const importBatches: AppImportBatch[] = [
  {
    id: "import-1",
    campaignId: "pastoral-invierno-2026",
    sourceName: "Contactos Notion Pastoral 2025",
    sourceType: "notion",
    status: "needs_review",
    rowCount: 84,
    appliedCount: 61,
    duplicateCount: 18,
    errorCount: 5,
    createdAt: "2026-04-30T16:00:00Z",
  },
  {
    id: "import-2",
    campaignId: "caa-eventos-2026",
    sourceName: "Excel auspicios eventos",
    sourceType: "excel",
    status: "parsed",
    rowCount: 132,
    appliedCount: 0,
    duplicateCount: 27,
    errorCount: 3,
    createdAt: "2026-05-01T09:00:00Z",
  },
];

export function getContactPriority(contact: AppContact) {
  if (contact.verificationStatus !== "verified") return 0;

  return scoreContactPriority({
    role: contact.role,
    isDecisionMaker: contact.isDecisionMaker,
    confidence: contact.confidence,
  });
}

export function getDashboardStats() {
  const pendingMessages = messages.filter(
    (message) => message.status === "needs_review",
  ).length;
  const approvedMessages = messages.filter(
    (message) => message.status === "approved",
  ).length;
  const repliesPending = replies.filter(
    (reply) => reply.approvalStatus === "needs_review",
  ).length;
  const activeCompanies = companies.filter(
    (company) =>
      !["closed_negative", "closed_positive"].includes(company.status),
  ).length;

  return {
    activeCompanies,
    pendingMessages,
    approvedMessages,
    repliesPending,
  };
}

export function getCompany(id: string) {
  return companies.find((company) => company.id === id);
}

export function getContact(id: string) {
  return contacts.find((contact) => contact.id === id);
}

export function getSender(id: string) {
  return senders.find((sender) => sender.id === id);
}
