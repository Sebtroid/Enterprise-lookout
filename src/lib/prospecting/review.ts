import type { AppCompany, AppContact, AppMessage, AppSender } from "./demo-data";

export const outboundRejectionReasons = {
  company_not_fit: "La empresa no parece ser fit",
  bad_copy: "El mail está mal redactado",
} as const;

export type OutboundRejectionReason = keyof typeof outboundRejectionReasons;

export function splitOutboundReviewQueue<
  TMessage extends {
    status?: AppMessage["status"];
    localStatus?: AppMessage["status"];
    futureNote?: string;
  },
>(messages: TMessage[]) {
  return {
    pending: messages.filter(
      (message) =>
        getMessageStatus(message) === "needs_review" && !isRedraft(message),
    ),
    redrafts: messages.filter(
      (message) =>
        getMessageStatus(message) === "needs_review" && isRedraft(message),
    ),
    approved: messages.filter(
      (message) => getMessageStatus(message) === "approved",
    ),
  };
}

function getMessageStatus(message: {
  status?: AppMessage["status"];
  localStatus?: AppMessage["status"];
}) {
  return message.localStatus ?? message.status;
}

export function isRedraft(message: { futureNote?: string }) {
  return (message.futureNote ?? "").startsWith("Nuevo borrador generado");
}

export function buildRedraftSubject(subject: string) {
  return subject.startsWith("Nuevo borrador: ")
    ? subject
    : `Nuevo borrador: ${subject}`;
}

export function buildRedraftedBody({
  originalBody,
  reason,
  feedback,
  rememberedFeedback = [],
}: {
  originalBody: string;
  reason: OutboundRejectionReason;
  feedback: string;
  rememberedFeedback?: string[];
}) {
  const trimmedFeedback = feedback.trim();
  const futureGuidance = rememberedFeedback
    .map((item) => item.trim())
    .filter(Boolean);
  const preservedGreeting = originalBody
    .split("\n")
    .find((line) => line.trim().toLowerCase().startsWith("hola"));
  const greeting = preservedGreeting?.trim() || "Hola,";
  const closing = extractClosing(originalBody);

  if (reason === "company_not_fit") {
    return originalBody;
  }

  return [
    greeting,
    "",
    "Te escribo por Pastoral UC / Trabajo País. Estamos preparando una iniciativa social universitaria y queremos revisar si existe un espacio concreto de colaboración o derivación con ustedes.",
    "",
    trimmedFeedback
      ? `Feedback aplicado: ${trimmedFeedback}`
      : "Feedback aplicado: hacer el mensaje más claro, concreto y accionable.",
    futureGuidance.length
      ? `Criterios recordados para futuras redacciones: ${futureGuidance.join(" ")}`
      : null,
    "",
    "Si te parece, ¿podríamos coordinar una reunión corta o enviarte una propuesta breve para revisar el calce?",
    "",
    closing,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export function buildOutboundEnvelope({
  company,
  contact,
  sender,
}: {
  company: AppCompany | undefined;
  contact: AppContact | undefined;
  sender: AppSender | undefined;
}) {
  const companyLabel = company?.name || "Empresa sin definir";
  const contactLabel = contact?.name || "Contacto sin definir";
  const recipientEmail = contact?.email || "email sin definir";
  const senderEmail = sender?.email || "remitente sin definir";

  return {
    companyLabel,
    contactLabel,
    recipientLabel:
      contact?.email && contact?.name
        ? `${contact.name} <${contact.email}>`
        : recipientEmail,
    senderLabel:
      sender?.email && sender?.displayName
        ? `${sender.displayName} <${sender.email}>`
        : senderEmail,
    senderOrganization: sender?.organization || "",
  };
}

function extractClosing(body: string) {
  const lines = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const index = lines.findIndex((line) =>
    ["equipo", "saludos", "sebastian", "pastoral"].some((needle) =>
      line.toLowerCase().startsWith(needle),
    ),
  );

  if (index === -1) return "Equipo Pastoral UC";
  return lines.slice(index).join("\n");
}
