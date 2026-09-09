export function requireGmailDraftProvider(identity: {
  gmailAccountId: string | null;
  microsoftAccountId: string | null;
}) {
  if (identity.microsoftAccountId) {
    throw new Error("El envío Microsoft 365 todavía no está disponible");
  }
  if (!identity.gmailAccountId) throw new Error("El borrador no tiene una cuenta de correo asociada");
  return identity.gmailAccountId;
}
