import { NextRequest, NextResponse } from "next/server";

import { isAuthorizedAgentRequest } from "@/lib/agent/auth";
import { getAllowedUser } from "@/lib/auth/request";
import {
  getDomCompanyCandidatesData,
  getDomTasksData,
} from "@/lib/dom/repository";

export async function GET(req: NextRequest) {
  const authorizedAgent = isAuthorizedAgentRequest(req);
  const user = authorizedAgent
    ? { id: "agent", email: "agent" }
    : await getAllowedUser({ allowDemoUser: true, request: req });

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const scope = req.nextUrl.searchParams.get("scope") || "all";
  const [tasks, companyCandidates] = await Promise.all([
    getDomTasksData(scope),
    getDomCompanyCandidatesData(scope),
  ]);

  return NextResponse.json({ ok: true, tasks, companyCandidates });
}
