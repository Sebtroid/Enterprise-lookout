import { getAllowedUser } from "@/lib/auth/request";

// The V1 DOM chat wrote directly through SUPABASE_DB_URL. It is intentionally
// retired: user-facing intelligence now goes through scoped V2 tools and RLS.
export async function POST() {
  const user = await getAllowedUser({ allowDemoUser: true });
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(
    { error: "legacy_endpoint_retired", message: "Usa las herramientas V2 de investigación y borradores." },
    { status: 410 },
  );
}
