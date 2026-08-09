import { getAllowedUser } from "@/lib/auth/request";
import { activateFollowupSequence } from "@/lib/v2/followup-worker";

export async function POST(_request: Request, { params }: { params: Promise<{ sequenceId: string }> }) { const user = await getAllowedUser(); if (!user) return Response.json({ error: "unauthorized" }, { status: 401 }); try { return Response.json(await activateFollowupSequence((await params).sequenceId, user.id)); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "activation_failed" }, { status: 409 }); } }
