import { getAllowedUser } from "@/lib/auth/request";
import { syncGmailAccount } from "@/lib/v2/gmail-sync";

export async function POST(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const user = await getAllowedUser(); if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  try { const { accountId } = await params; return Response.json(await syncGmailAccount(accountId, user.id)); }
  catch (error) { const message = error instanceof Error ? error.message : "No se pudo sincronizar Gmail"; return Response.json({ error: message }, { status: /permiso/.test(message) ? 403 : 400 }); }
}
