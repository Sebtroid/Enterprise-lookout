import type { NextRequest } from "next/server";

export function isAuthorizedAgentRequest(req: NextRequest) {
  const authorization = req.headers.get("authorization");
  if (!authorization) return false;

  return [process.env.AGENT_API_TOKEN, process.env.DOM_API_TOKEN]
    .filter(Boolean)
    .some((token) => authorization === `Bearer ${token}`);
}
