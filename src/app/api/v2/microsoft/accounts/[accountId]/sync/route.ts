import { getAllowedUser } from "@/lib/auth/request";

export async function POST(_request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const user = await getAllowedUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  await params;
  return Response.json(
    { error: "La sincronización Microsoft 365 todavía no está disponible" },
    { status: 501 },
  );
}
