import { NextRequest, NextResponse } from "next/server";
import postgres from "postgres";

interface ChatRequest {
  message: string;
  scope: string;
  history: { role: string; content: string }[];
}

const sql = postgres(process.env.SUPABASE_DB_URL!, {
  ssl: "require",
  prepare: false,
  max: 1,
});

export async function POST(req: NextRequest) {
  try {
    const body: ChatRequest = await req.json();
    const { message, scope } = body;

    // Detectar intención del mensaje
    const intent = detectIntent(message);
    
    switch (intent.type) {
      case "research_companies":
        return handleResearchCompanies(message, scope);
      case "draft_email":
        return handleDraftEmail(message, scope);
      case "send_email":
        return handleSendEmail(message, scope);
      case "list_pending":
        return handleListPending(scope);
      case "help":
      default:
        return NextResponse.json({
          content: `Entendido: "${message}"\n\nPuedo ayudarte con:\n• "Busca empresas de [industria] para [campaña]"\n• "Redacta un mail para [empresa]"\n• "Manda los mails aprobados"\n• "Revisa las respuestas pendientes"\n\n¿Qué necesitas?`,
          actionType: "help",
        });
    }
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { content: "Error procesando tu mensaje. Intenta de nuevo.", actionType: "error" },
      { status: 500 }
    );
  }
}

function detectIntent(message: string): { type: string } {
  const lower = message.toLowerCase();
  
  if (/busca|encuentra|investiga|buscar|encontrar/.test(lower) && /empresa|empresas|marca|marcas/.test(lower)) {
    return { type: "research_companies" };
  }
  
  if (/redacta|escribe|draft|crea un mail|nuevo mail/.test(lower) && /mail|email|correo/.test(lower)) {
    return { type: "draft_email" };
  }
  
  if (/manda|envía|enviar|mandar/.test(lower) && /mail|email|correo|aprobado/.test(lower)) {
    return { type: "send_email" };
  }
  
  if (/pendiente|revisa|ver|estado|pipeline/.test(lower)) {
    return { type: "list_pending" };
  }
  
  return { type: "help" };
}

async function handleResearchCompanies(message: string, scope: string) {
  // Extraer industria/campaña del mensaje
  const industry = extractIndustry(message);
  
  return NextResponse.json({
    content: `🔍 **Investigando empresas**${industry ? ` de ${industry}` : ""}${scope !== "all" ? ` para ${scope}` : ""}...\n\nEsta función requiere conexión con el motor de investigación. Por ahora, puedes:\n1. Ir a "Empresas" en tu campaña\n2. Usar "Imports" para subir un CSV\n3. Pedirme que redacte mails para empresas específicas\n\n¿Quieres que busque empresas reales usando búsqueda web? (Necesito activar la integración)`,
    actionType: "research_companies",
    actionPayload: { industry, scope },
  });
}

async function handleDraftEmail(message: string, scope: string) {
  return NextResponse.json({
    content: `✍️ **Redactando mail**...\n\nPara generar un mail necesito:\n• Nombre de la empresa o contacto\n• Campaña activa\n• Contexto del evento\n\n¿Para qué empresa quieres el mail? Puedo generarlo al instante una vez me des el nombre.`,
    actionType: "draft_email",
    actionPayload: { scope },
  });
}

async function handleSendEmail(message: string, scope: string) {
  // Verificar si hay mails aprobados
  try {
    const rows = await sql`
      select count(*)::int as count
      from messages m
      join campaigns c on c.id = m.campaign_id
      where m.status = 'approved'
        and m.kind in ('outbound_initial', 'outbound_followup', 'outbound_reply')
        and ${scope === "all" ? sql`true` : sql`c.slug = ${scope}`}
    `;
    
    const count = rows[0]?.count ?? 0;
    
    return NextResponse.json({
      content: count > 0
        ? `📤 **${count} mails aprobados** listos para enviar.\n\nActualmente el envío es manual (Outlook Web).\nPara automatizar el envío real necesito conectar Gmail OAuth.\n\n¿Quieres que configure la conexión de Gmail ahora?`
        : `No hay mails aprobados para enviar. Ve a "Mails" y aprueba algunos primero.`,
      actionType: "send_email",
      actionPayload: { approvedCount: count, scope },
    });
  } catch {
    return NextResponse.json({
      content: "Error consultando mails aprobados.",
      actionType: "error",
    });
  }
}

async function handleListPending(scope: string) {
  try {
    const rows = await sql`
      select 
        count(*) filter (where status = 'needs_review')::int as needs_review,
        count(*) filter (where status = 'approved')::int as approved,
        count(*) filter (where status = 'replied')::int as replies
      from messages m
      join campaigns c on c.id = m.campaign_id
      where ${scope === "all" ? sql`true` : sql`c.slug = ${scope}`}
    `;
    
    const stats = rows[0];
    
    return NextResponse.json({
      content: `📊 **Estado actual**${scope !== "all" ? ` (${scope})` : ""}:\n\n• **${stats?.needs_review ?? 0}** mails pendientes de revisión\n• **${stats?.approved ?? 0}** mails aprobados para enviar\n• **${stats?.replies ?? 0}** respuestas entrantes\n\n¿Quieres que revise los pendientes o redacte algo nuevo?`,
      actionType: "list_pending",
      actionPayload: stats,
    });
  } catch {
    return NextResponse.json({
      content: "Error consultando estado.",
      actionType: "error",
    });
  }
}

function extractIndustry(message: string): string | null {
  const patterns = [
    /empresas de ([\w\s]+)/i,
    /marcas de ([\w\s]+)/i,
    /busca ([\w\s]+) para/i,
    /industria ([\w\s]+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) return match[1].trim();
  }
  
  return null;
}
