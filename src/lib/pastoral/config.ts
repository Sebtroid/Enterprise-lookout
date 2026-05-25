export const PASTORAL_CAMPAIGN_SLUG = "pastoral-invierno-2026";

export const DEFAULT_PASTORAL_CONTACT_SHEET_ID =
  "10SpS_-eUS0Trhf6YZiZuolRgmVuh3zkHgKzXvwDR7AI";

export const PASTORAL_CONTACT_SHEET_ID =
  process.env.PASTORAL_CONTACT_SHEET_ID ?? DEFAULT_PASTORAL_CONTACT_SHEET_ID;

export const PASTORAL_CONTACT_SHEET_RANGE =
  process.env.PASTORAL_CONTACT_SHEET_RANGE ?? "A:F";

export const PASTORAL_CONTACT_SHEET_URL =
  `https://docs.google.com/spreadsheets/d/${PASTORAL_CONTACT_SHEET_ID}/edit`;

export const PASTORAL_CONTACT_SHEET_CSV_URL =
  `https://docs.google.com/spreadsheets/d/${PASTORAL_CONTACT_SHEET_ID}/export?format=csv&gid=0`;

export const pastoralFundraisingGoals = [
  { date: "2026-05-24", amount: 300000 },
  { date: "2026-05-31", amount: 600000 },
  { date: "2026-06-07", amount: 900000 },
  { date: "2026-06-14", amount: 1500000 },
  { date: "2026-06-21", amount: 2500000 },
  { date: "2026-06-28", amount: 4500000 },
  { date: "2026-07-05", amount: 6000000 },
];

export const pastoralBankAccount = {
  bank: "Itaú",
  name: "Pontificia Universidad Católica de Chile",
  rut: "81.698.900-0",
  type: "Cuenta Corriente",
  number: "231392483",
  email: "donaciones.uc@uc.cl",
};

export const pastoralImpactStats = [
  { label: "Voluntarios históricos", value: "+20.000" },
  { label: "Voluntarios 2026", value: "850" },
  { label: "Comunidades", value: "+450" },
  { label: "Zonas 2026", value: "25" },
  { label: "Meta zona", value: "$6.000.000" },
];

export const pastoralSendRules = [
  "Antes de enviar, revisar el Sheets compartido por email y nombre de empresa.",
  "No enviar si ya aparece contactado por otra persona o zona.",
  "Enviar preferentemente lunes, martes o miércoles entre 9:00 y 12:00.",
  "Adjuntar siempre la carta de beneficio tributario en PDF.",
  "Hacer seguimiento 5 a 7 días después si no contestan.",
];

export const pastoralDonationSteps = {
  withoutCertificate: [
    "Enviar datos de transferencia UC.",
    "Pedir RUT del donante y comprobante de transferencia.",
    "Rellenar formulario interno por cada transacción.",
    "Avisar al equipo de finanzas que llegó una donación.",
    "Anotar ingreso de zona y agradecer.",
  ],
  withCertificate: [
    "Validar monto mínimo: empresas desde $250.000, personas naturales desde $500.000.",
    "Enviar datos de transferencia UC.",
    "Pedir razón social, giro, dirección, RUT empresa y datos del representante legal.",
    "Pedir comprobante original de transferencia, no pantallazo.",
    "Reenviar todo a finanzas@trabajopais.cl dentro de 3 días hábiles.",
    "Anotar ingreso de zona y agradecer.",
  ],
};
