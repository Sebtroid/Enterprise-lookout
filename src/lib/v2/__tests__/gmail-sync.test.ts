import { describe, expect, it } from "vitest";
import { extractGmailMessage } from "@/lib/v2/gmail-sync";

describe("Gmail message extraction", () => {
  it("extracts headers, nested bodies and secure Gmail attachment links", () => {
    const encode = (value: string) => Buffer.from(value).toString("base64url");
    const message = extractGmailMessage({ id: "m1", threadId: "t1", internalDate: "1770000000000", snippet: "hola", payload: { mimeType: "multipart/alternative", headers: [{ name: "From", value: "Martín <m@soprole.cl>" }, { name: "To", value: "seb@uc.cl" }, { name: "Subject", value: "Colaboración" }], parts: [{ mimeType: "text/plain", body: { data: encode("Respuesta") } }, { mimeType: "text/html", body: { data: encode("<p>Respuesta</p>") } }, { mimeType: "application/pdf", filename: "propuesta.pdf", body: { attachmentId: "a1" } }] } }, "seb@uc.cl");
    expect(message.bodyText).toBe("Respuesta");
    expect(message.bodyHtml).toBe("<p>Respuesta</p>");
    expect(message.attachments[0]).toMatchObject({ filename: "propuesta.pdf", attachmentId: "a1" });
    expect(message.attachments[0].gmailUrl).toContain("mail.google.com");
  });
});
