import { NextResponse } from "next/server";

import { buildGptActionsOpenApiSchema } from "@/lib/gpt/actions-openapi";

export async function GET() {
  return NextResponse.json(buildGptActionsOpenApiSchema());
}
