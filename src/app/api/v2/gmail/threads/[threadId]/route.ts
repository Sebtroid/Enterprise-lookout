import { z } from "zod";
import { getAllowedUser } from "@/lib/auth/request";
import { linkGmailThread, readGmailThread } from "@/lib/v2/gmail-sync";

const linkSchema = z.object({ projectId: z.string().uuid(), companyId: z.string().uuid().nullable().optional(), contactId: z.string().uuid().nullable().optional() });

export async function GET(_request: Request, { params }: { params: Promise<{ threadId: string }> }) { const user = await getAllowedUser(); if (!user) return Response.json({ error: "unauthorized" }, { status: 401 }); try { return Response.json(await readGmailThread((await params).threadId, user.id)); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "thread_failed" }, { status: 400 }); } }
export async function PATCH(request: Request, { params }: { params: Promise<{ threadId: string }> }) { const user = await getAllowedUser(); if (!user) return Response.json({ error: "unauthorized" }, { status: 401 }); const parsed = linkSchema.safeParse(await request.json()); if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 }); try { return Response.json(await linkGmailThread({ threadId: (await params).threadId, userId: user.id, ...parsed.data })); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "link_failed" }, { status: 400 }); } }
