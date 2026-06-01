import type { MimeAttachmentInput } from "@/lib/gmail/mime";

export const PASTORAL_BENEFIT_ATTACHMENT = {
  contentType: "application/pdf",
  filename: "carta-beneficio-tributario-2026.pdf",
  publicPath: "/pastoral/carta-beneficio-tributario-2026.pdf",
};

export async function getPastoralBenefitAttachments({
  baseUrl,
}: {
  baseUrl: string | URL;
}): Promise<MimeAttachmentInput[]> {
  const attachmentUrl = new URL(PASTORAL_BENEFIT_ATTACHMENT.publicPath, baseUrl);
  const response = await fetch(attachmentUrl, { cache: "force-cache" });

  if (!response.ok) {
    throw new Error(
      `No pude cargar ${PASTORAL_BENEFIT_ATTACHMENT.filename} (${response.status}).`,
    );
  }

  return [
    {
      content: new Uint8Array(await response.arrayBuffer()),
      contentType: PASTORAL_BENEFIT_ATTACHMENT.contentType,
      filename: PASTORAL_BENEFIT_ATTACHMENT.filename,
    },
  ];
}
