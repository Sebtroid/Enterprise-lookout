import { NextRequest, NextResponse } from "next/server";

import {
  getKimiDeepResearchInstructions,
  kimiDeepResearchJobName,
} from "@/lib/prospecting/kimi-research";
import { getPostgresClient } from "@/lib/supabase/postgres";

interface ChatRequest {
  message: string;
  scope: string;
  history: { role: string; content: string }[];
}

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
          content: `Entendido: "${message}"\n\nPuedo ayudarte con:\n• "Busca empresas de [industria] para este proyecto"\n• "Redacta un mail para [empresa]"\n• "Manda los mails aprobados"\n• "Revisa las respuestas pendientes"\n• "Muéstrame empresas sin evaluar aquí"\n\n¿Qué necesitas?`,
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
  const sql = getPostgresClient();
  const rubrics = extractIndustry(message) ?? message;

  if (!sql) {
    return NextResponse.json({
      content: "Falta SUPABASE_DB_URL para dejar esta investigación en la cola de KimiClaw.",
      actionType: "error",
    });
  }

  if (scope === "all") {
    return NextResponse.json({
      content:
        "Elige un proyecto concreto primero. La investigación depende del contexto: qué es el proyecto, público y qué se necesita conseguir.",
      actionType: "research_companies",
      actionPayload: { rubrics, scope },
    });
  }

  const campaignRows = await sql`
    select id, slug, name, organization, description, value_proposition
    from campaigns
    where slug = ${scope}
    limit 1
  `;
  const campaign = campaignRows[0];

  if (!campaign) {
    return NextResponse.json({
      content: "No encontré ese proyecto. Crea o abre el proyecto antes de pedir investigación.",
      actionType: "error",
    });
  }

  await sql`
    insert into automation_runs (
      campaign_id,
      job_name,
      status,
      input_summary,
      output_summary
    ) values (
      ${campaign.id},
      ${kimiDeepResearchJobName},
      'running',
      ${sql.json({
        requestedBy: "dom-chat",
        sourceMode: "existing_and_new",
        rubrics,
        originalMessage: message,
        project: {
          slug: campaign.slug,
          name: campaign.name,
          organization: campaign.organization,
          description: campaign.description,
          valueProposition: campaign.value_proposition,
        },
        instructions: getKimiDeepResearchInstructions(),
      })},
      ${sql.json({
        nextStep:
          "KimiClaw debe investigar empresas nuevas, encontrar contactos directos con fuente y dejar inferencias de email como unverified.",
      })}
    )
  `;

  return NextResponse.json({
    content: `Listo. Dejé una tarea para KimiClaw: investigar ${rubrics} con investigación profunda para ${campaign.name}.\n\nCriterio guardado: primero empresas nuevas útiles, después contactos directos con fuente. Los emails inferidos quedan no verificados y no se deben enviar hasta verificarlos.`,
    actionType: "research_companies",
    actionPayload: { rubrics, scope, jobName: kimiDeepResearchJobName },
    actionTaken: true,
  });
}

async function handleDraftEmail(message: string, scope: string) {
  return NextResponse.json({
    content: `Para redactar necesito:\n• Empresa/contacto\n• Proyecto activo\n• Qué quieres conseguir: dinero, producto, comida, copete, premios, activación, etc.\n• Tono: cercano, formal o muy corto\n\nDime la empresa y el objetivo, y lo dejamos como borrador para aprobar.`,
    actionType: "draft_email",
    actionPayload: { scope },
  });
}

async function handleSendEmail(message: string, scope: string) {
  const sql = getPostgresClient();
  if (!sql) {
    return NextResponse.json({
      content: "Falta SUPABASE_DB_URL para consultar mails aprobados.",
      actionType: "error",
    });
  }

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
        ? `${count} mails aprobados listos para enviar.\n\nSi el remitente tiene Gmail conectado, se pueden enviar directo desde "Mails". Si es respuesta a un thread, se manda en el mismo hilo Gmail.`
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
  const sql = getPostgresClient();
  if (!sql) {
    return NextResponse.json({
      content: "Falta SUPABASE_DB_URL para consultar el estado.",
      actionType: "error",
    });
  }

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
      content: `Estado actual${scope !== "all" ? ` (${scope})` : ""}:\n\n• ${stats?.needs_review ?? 0} mails pendientes de revisión\n• ${stats?.approved ?? 0} mails aprobados para enviar\n• ${stats?.replies ?? 0} respuestas entrantes\n\nSiguiente paso normal: revisar "Empresas" sin evaluar o enviar los aprobados.`,
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
