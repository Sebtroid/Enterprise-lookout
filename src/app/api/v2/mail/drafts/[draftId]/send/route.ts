import { getAllowedUser } from "@/lib/auth/request";
import { sendApprovedV2Draft } from "@/lib/v2/gmail-send";

export async function POST(_request: Request, { params }: { params: Promise<{ draftId: string }> }) { const user = await getAllowedUser(); if (!user) return Response.json({ error: "unauthorized" }, { status: 401 }); try { return Response.json(await sendApprovedV2Draft((await params).draftId, user.id)); } catch (error) { const message = error instanceof Error ? error.message : "send_failed"; return Response.json({ error: message }, { status: /bloqueado/.test(message) ? 409 : 400 }); } }
