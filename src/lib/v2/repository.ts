import { isDemoAccessEnabled } from "@/lib/auth/route-policy";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { v2DemoSnapshot } from "@/lib/v2/demo-data";
import type {
  FactStatus,
  V2AttentionItem,
  V2Company,
  V2Contact,
  V2InboxThread,
  V2Project,
  V2SettingsResult,
  V2SettingsSnapshot,
  V2WorkspaceSnapshot,
} from "@/lib/v2/types";

type Row = Record<string, unknown>;

function relation(value: unknown): Row | null {
  if (Array.isArray(value)) return (value[0] as Row | undefined) ?? null;
  return value && typeof value === "object" ? (value as Row) : null;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function number(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateLabel(value: unknown): string {
  if (typeof value !== "string") return "Sin fecha";
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Santiago",
  }).format(new Date(value));
}

function contactQuality(row: Row): V2Contact["quality"] {
  if (row.do_not_contact || row.last_bounced_at) return "obsoleto";
  if (row.is_decision_maker) return "decisor";
  const status = text(row.verification_status);
  if (["verified", "confirmed"].includes(status)) return "verificado";
  return "encontrado";
}

function companyContactQuality(row: Row | null): V2Company["contactQuality"] {
  if (!row) return "sin contacto";
  const quality = contactQuality(row);
  if (quality === "decisor") return "decisor";
  if (quality === "verificado") return "verificado";
  return "encontrado";
}

function factStatus(value: unknown): FactStatus {
  const allowed: FactStatus[] = ["estimated", "found", "verified", "confirmed", "disputed", "stale"];
  return allowed.includes(value as FactStatus) ? (value as FactStatus) : "found";
}

function attentionKind(value: unknown): V2AttentionItem["kind"] {
  return ["approval", "reply", "research", "followup", "task"].includes(String(value))
    ? (value as V2AttentionItem["kind"])
    : "task";
}

async function loadLiveSnapshot(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  user: { id: string; email?: string; user_metadata?: Record<string, unknown> },
  membership: Row,
): Promise<V2WorkspaceSnapshot> {
  if (!supabase) throw new Error("Supabase no está configurado");
  const workspaceId = text(membership.workspace_id);

  const [
    profilesResult,
    projectsResult,
    companiesResult,
    contactsResult,
    projectCompaniesResult,
    goalsResult,
    contributionsResult,
    messagesResult,
    threadsResult,
    draftsResult,
    senderIdentitiesResult,
    senderPermissionsResult,
    tasksResult,
    jobsResult,
    usageResult,
  ] = await Promise.all([
    supabase.from("workspace_members").select("user_id, profiles(display_name)").eq("workspace_id", workspaceId).eq("status", "active"),
    supabase.from("projects").select("id,name,status,access_mode,ends_on,brief,owner:profiles!projects_owner_user_id_fkey(display_name),institution:institutions(name)").eq("workspace_id", workspaceId).neq("status", "archived").order("updated_at", { ascending: false }),
    supabase.from("companies").select("id,canonical_name,domain,industry,quality_rating,description").eq("workspace_id", workspaceId).eq("record_state", "active").order("canonical_name"),
    supabase.from("contacts").select("id,company_id,full_name,role,email,phone,verification_status,is_decision_maker,do_not_contact,last_bounced_at,source,verified_at,updated_at").eq("workspace_id", workspaceId).eq("record_state", "active").order("full_name"),
    supabase.from("project_companies").select("id,project_id,company_id,primary_contact_id,fit_score,next_action,project:projects(name)").eq("workspace_id", workspaceId),
    supabase.from("finance_goals").select("project_id,fundraising_goal").eq("workspace_id", workspaceId),
    supabase.from("contributions").select("project_id,kind,status,committed_value,received_value").eq("workspace_id", workspaceId),
    supabase.from("mail_messages").select("thread_id,sender,body_text,snippet,sent_at,received_at").eq("workspace_id", workspaceId).eq("is_crm_linked", true).order("created_at", { ascending: true }),
    supabase.from("mail_threads").select("id,subject,snippet,last_message_at,labels,gmail_accounts(email),projects(name),companies(canonical_name),contacts(full_name)").eq("workspace_id", workspaceId).order("last_message_at", { ascending: false }).limit(100),
    supabase.from("mail_drafts").select("id,thread_id,kind,subject,body,status,to_email,created_at,sender_identity_id,sender_identities(id,gmail_account_id,display_name,gmail_accounts(email)),projects(name),companies(canonical_name),contacts(full_name)").eq("workspace_id", workspaceId).in("status", ["draft", "needs_review", "approved", "failed"]).order("updated_at", { ascending: false }).limit(100),
    supabase.from("sender_identities").select("id,gmail_account_id,gmail_accounts(email,owner_user_id,active)").eq("workspace_id", workspaceId).eq("active", true),
    supabase.from("gmail_account_permissions").select("gmail_account_id,can_draft,can_send").eq("user_id", user.id).eq("active", true),
    supabase.from("project_tasks").select("id,project_id,title,due_at,source,assigned_to,projects(name),profiles!project_tasks_assigned_to_fkey(display_name)").eq("workspace_id", workspaceId).in("status", ["pending", "in_progress"]).order("due_at", { ascending: true }).limit(30),
    supabase.from("ai_jobs").select("id,job_type,status,approved_by,projects(name)").eq("workspace_id", workspaceId).in("status", ["approved", "completed", "reviewing", "failed"]).order("updated_at", { ascending: false }).limit(30),
    supabase.from("ai_usage_ledger").select("cost_usd").eq("workspace_id", workspaceId).gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
  ]);

  const results = [profilesResult, projectsResult, companiesResult, contactsResult, projectCompaniesResult, goalsResult, contributionsResult, messagesResult, threadsResult, draftsResult, senderIdentitiesResult, senderPermissionsResult, tasksResult, jobsResult, usageResult];
  const failed = results.find((result) => result.error);
  if (failed?.error) throw new Error(`No se pudo cargar Enterprise Lookout V2: ${failed.error.message}`);

  const profiles = (profilesResult.data ?? []) as Row[];
  const projectRows = (projectsResult.data ?? []) as Row[];
  const companyRows = (companiesResult.data ?? []) as Row[];
  const contactRows = (contactsResult.data ?? []) as Row[];
  const projectCompanyRows = (projectCompaniesResult.data ?? []) as Row[];
  const goalRows = (goalsResult.data ?? []) as Row[];
  const contributionRows = (contributionsResult.data ?? []) as Row[];
  const messageRows = (messagesResult.data ?? []) as Row[];
  const draftRows = (draftsResult.data ?? []) as Row[];
  const senderIdentityRows = (senderIdentitiesResult.data ?? []) as Row[];
  const senderPermissionRows = (senderPermissionsResult.data ?? []) as Row[];

  const permissionsByAccount = new Map(senderPermissionRows.map((row) => [text(row.gmail_account_id), row]));
  const eligibleSenders = senderIdentityRows.flatMap((identity) => {
    const account = relation(identity.gmail_accounts);
    const permission = permissionsByAccount.get(text(identity.gmail_account_id));
    if (!account || account.active !== true || !text(account.email) || !(permission?.can_draft && permission.can_send)) return [];
    return [{ senderIdentityId: text(identity.id), email: text(account.email), provider: "gmail" as const }];
  });

  const contactsById = new Map(contactRows.map((row) => [text(row.id), row]));
  const companiesById = new Map(companyRows.map((row) => [text(row.id), row]));
  const projects: V2Project[] = projectRows.map((row) => {
    const links = projectCompanyRows.filter((item) => item.project_id === row.id);
    const contributions = contributionRows.filter((item) => item.project_id === row.id);
    const goal = goalRows.find((item) => item.project_id === row.id);
    const brief = relation(row.brief) ?? (row.brief as Row | null) ?? {};
    return {
      id: text(row.id),
      name: text(row.name, "Proyecto sin nombre"),
      institution: text(relation(row.institution)?.name, "Sin institución"),
      ownerName: text(relation(row.owner)?.display_name, "Sin propietario"),
      accessMode: row.access_mode === "shared" ? "shared" : "personal",
      status: row.status === "active" || row.status === "paused" ? row.status : "draft",
      goal: number(goal?.fundraising_goal),
      committed: contributions.reduce((sum, item) => sum + number(item.committed_value), 0),
      received: contributions.reduce((sum, item) => sum + number(item.received_value), 0),
      companies: links.length,
      nextAction: text(brief.next_action, links.find((item) => item.next_action)?.next_action ? text(links.find((item) => item.next_action)?.next_action) : "Definir siguiente acción"),
      eventDate: typeof row.ends_on === "string" ? row.ends_on : null,
    };
  });

  const companies: V2Company[] = companyRows.map((row) => {
    const links = projectCompanyRows.filter((item) => item.company_id === row.id);
    const primary = contactsById.get(text(links.find((item) => item.primary_contact_id)?.primary_contact_id)) ?? null;
    return {
      id: text(row.id),
      name: text(row.canonical_name, "Empresa sin nombre"),
      domain: text(row.domain, "Sin dominio"),
      industry: text(row.industry, "Sin industria"),
      fitScore: Math.max(0, ...links.map((item) => number(item.fit_score))),
      factStatus: factStatus((row as Row).fact_status),
      projectNames: links.map((item) => text(relation(item.project)?.name)).filter(Boolean),
      contactName: primary ? text(primary.full_name) : null,
      contactQuality: companyContactQuality(primary),
      nextAction: text(links.find((item) => item.next_action)?.next_action, "Revisar ficha"),
    };
  });

  const contacts: V2Contact[] = contactRows.map((row) => ({
    id: text(row.id),
    name: text(row.full_name, "Contacto sin nombre"),
    company: text(companiesById.get(text(row.company_id))?.canonical_name, "Sin empresa"),
    role: text(row.role, "Rol por verificar"),
    email: text(row.email, "Sin correo"),
    phone: typeof row.phone === "string" ? row.phone : null,
    quality: contactQuality(row),
    evidence: `${text(row.source, "Sin fuente")} · ${dateLabel(row.verified_at ?? row.updated_at)}`,
    lastInteraction: "Ver historial",
  }));

  const messagesByThread = new Map<string, Row[]>();
  for (const message of messageRows) {
    const threadId = text(message.thread_id);
    messagesByThread.set(threadId, [...(messagesByThread.get(threadId) ?? []), message]);
  }
  const threads: V2InboxThread[] = ((threadsResult.data ?? []) as Row[]).map((row) => {
    const company = text(relation(row.companies)?.canonical_name, "Sin empresa vinculada");
    const contact = text(relation(row.contacts)?.full_name, "Contacto por identificar");
    const account = text(relation(row.gmail_accounts)?.email, "Cuenta no disponible");
    const draft = draftRows.find((item) => item.thread_id === row.id);
    const messages = (messagesByThread.get(text(row.id)) ?? []).map((message) => {
      const inbound = !text(message.sender).toLowerCase().includes(account.toLowerCase());
      return {
        direction: inbound ? "inbound" as const : "outbound" as const,
        author: inbound ? text(message.sender, contact) : account,
        body: text(message.body_text, text(message.snippet)),
        date: dateLabel(message.received_at ?? message.sent_at),
      };
    });
    return {
      id: text(row.id), account, provider: "gmail", company, contact,
      subject: text(row.subject, "Sin asunto"),
      snippet: text(row.snippet),
      receivedAt: dateLabel(row.last_message_at),
      unread: Array.isArray(row.labels) && row.labels.includes("UNREAD"),
      project: text(relation(row.projects)?.name, "Sin proyecto"),
      messages,
      advice: ["Revisa el contexto del proyecto y confirma los datos antes de responder."],
      suggestedReply: text(draft?.body),
      draftId: draft ? text(draft.id) : undefined,
      senderIdentityId: draft ? text(draft.sender_identity_id) : undefined,
      eligibleSenders: draft ? eligibleSenders : undefined,
      draftStatus: draft ? text(draft.status) as V2InboxThread["draftStatus"] : undefined,
    };
  });

  const existingThreadIds = new Set(threads.map((thread) => thread.id));
  for (const draft of draftRows.filter((row) => !row.thread_id || !existingThreadIds.has(text(row.thread_id)))) {
    const identity = relation(draft.sender_identities);
    const gmail = relation(identity?.gmail_accounts);
    threads.push({
      id: `draft-${text(draft.id)}`,
      account: text(gmail?.email, text(identity?.display_name, "Remitente por seleccionar")),
      provider: "gmail",
      company: text(relation(draft.companies)?.canonical_name, "Sin empresa vinculada"),
      contact: text(relation(draft.contacts)?.full_name, text(draft.to_email, "Contacto por identificar")),
      subject: text(draft.subject, "Sin asunto"), snippet: text(draft.body).slice(0, 160), receivedAt: dateLabel(draft.created_at), unread: false,
      project: text(relation(draft.projects)?.name, "Sin proyecto"), messages: [],
      advice: [draft.kind === "first_contact" ? "Primer correo: requiere aprobación explícita antes del envío." : "Revisa el contexto antes de aprobar."],
      suggestedReply: text(draft.body), draftId: text(draft.id), senderIdentityId: text(draft.sender_identity_id), eligibleSenders, draftStatus: text(draft.status) as V2InboxThread["draftStatus"],
    });
  }

  const taskAttention: V2AttentionItem[] = ((tasksResult.data ?? []) as Row[]).map((row) => ({
    id: text(row.id), kind: "task", title: text(row.title), detail: "Tarea pendiente del proyecto.",
    project: text(relation(row.projects)?.name, "Sin proyecto"),
    owner: text(relation(row.profiles)?.display_name, "Equipo"), due: dateLabel(row.due_at),
    href: `/projects/${text(row.project_id)}`,
  }));
  const jobAttention: V2AttentionItem[] = ((jobsResult.data ?? []) as Row[]).filter((row) => ["completed", "reviewing", "failed"].includes(text(row.status))).map((row) => ({
    id: text(row.id), kind: attentionKind(text(row.job_type).includes("research") ? "research" : "approval"),
    title: row.status === "failed" ? "Trabajo requiere revisión" : "Resultado listo para revisar",
    detail: text(row.job_type).replaceAll("_", " "), project: text(relation(row.projects)?.name, "Workspace"),
    owner: "Equipo", due: "Ahora", href: "/today",
  }));

  const currentName = text(user.user_metadata?.full_name, user.email ?? "Usuario");
  return {
    workspaceName: text(relation(membership.workspaces)?.name, "Enterprise Lookout"),
    currentUser: currentName,
    teammates: profiles.map((row) => text(relation(row.profiles)?.display_name)).filter((name) => name && name !== currentName),
    projects, companies, contacts, threads,
    attention: [...taskAttention, ...jobAttention],
    aiBudget: {
      spentUsd: ((usageResult.data ?? []) as Row[]).reduce((sum, row) => sum + number(row.cost_usd), 0),
      limitUsd: number(process.env.MINIMAX_MONTHLY_BUDGET_USD || 5),
    },
  };
}

export async function getV2WorkspaceSnapshot(): Promise<V2WorkspaceSnapshot> {
  const demoEnabled = isDemoAccessEnabled({
    appMode: process.env.NEXT_PUBLIC_APP_MODE,
    nodeEnv: process.env.NODE_ENV,
  });
  const supabase = await getSupabaseServerClient();

  if (!supabase) {
    if (demoEnabled) return v2DemoSnapshot;
    throw new Error("Supabase no está configurado para Enterprise Lookout V2");
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    if (demoEnabled) return v2DemoSnapshot;
    throw new Error("Se requiere una sesión válida");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id, workspaces(name)")
    .eq("user_id", authData.user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership) {
    if (demoEnabled) return v2DemoSnapshot;
    throw new Error(membershipError?.message ?? "El usuario no pertenece a un workspace");
  }

  try {
    return await loadLiveSnapshot(supabase, authData.user, membership as Row);
  } catch (error) {
    if (demoEnabled) return v2DemoSnapshot;
    throw error;
  }
}

const demoSettingsSnapshot: V2SettingsSnapshot = {
  team: [
    { id: "demo-user", name: "Sebastián", role: "Propietario", status: "Activo" },
    { id: "demo-teammate", name: "José Miguel", role: "Miembro", status: "Activo" },
  ],
  mailProviders: [
    { id: "gmail", name: "Gmail", state: "not_configured", accounts: [] },
    { id: "microsoft", name: "Microsoft 365", state: "action_required", accounts: [] },
  ],
  integrations: [
    { id: "minimax", name: "MiniMax", detail: "Investigación y redacción asistida", state: "not_configured" },
    { id: "hunter", name: "Hunter", detail: "Búsqueda y verificación de contactos", state: "not_configured" },
  ],
  vault: [
    { id: "supabase-database", name: "Contraseña de base de datos Supabase", state: "unavailable", canReveal: false, canReplace: true },
    { id: "gmail-oauth", name: "Secreto OAuth de Gmail", state: "not_configured", canReveal: false, canReplace: true },
    { id: "microsoft-oauth", name: "Secreto OAuth de Microsoft", state: "not_configured", canReveal: false, canReplace: true },
    { id: "minimax-api", name: "Clave API de MiniMax", state: "not_configured", canReveal: false, canReplace: true },
    { id: "hunter-api", name: "Clave API de Hunter", state: "not_configured", canReveal: false, canReplace: true },
  ],
};

export async function getV2SettingsSnapshot(): Promise<V2SettingsResult> {
  const demoEnabled = isDemoAccessEnabled({ appMode: process.env.NEXT_PUBLIC_APP_MODE, nodeEnv: process.env.NODE_ENV });
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    if (demoEnabled) return { ...demoSettingsSnapshot, isDemo: true };
    throw new Error("Supabase no está configurado");
  }
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Se requiere una sesión válida");
  const { data: membership } = await supabase.from("workspace_members").select("workspace_id,role").eq("user_id", auth.user.id).eq("status", "active").limit(1).maybeSingle();
  if (!membership) throw new Error("El usuario no pertenece a un workspace");
  const [teamResult, accountsResult, permissionsResult] = await Promise.all([
    supabase.from("workspace_members").select("user_id,role,status,profiles(display_name)").eq("workspace_id", membership.workspace_id),
    supabase.from("gmail_accounts").select("id,email,sync_status,active").eq("workspace_id", membership.workspace_id).order("email"),
    supabase.from("gmail_account_permissions").select("gmail_account_id,can_read,can_draft,can_send,can_manage").eq("user_id", auth.user.id),
  ]);
  const error = teamResult.error ?? accountsResult.error ?? permissionsResult.error;
  if (error) {
    if (demoEnabled) return { ...demoSettingsSnapshot, isDemo: true };
    throw new Error(error.message);
  }
  const isOwner = membership.role === "owner";
  const permissionMap = new Map(((permissionsResult.data ?? []) as Row[]).map((row) => [text(row.gmail_account_id), row]));
  const gmailAccounts = ((accountsResult.data ?? []) as Row[]).map((row) => {
    const permission = permissionMap.get(text(row.id));
    const permissions = permission ? [permission.can_read && "leer", permission.can_draft && "redactar", permission.can_send && "enviar", permission.can_manage && "administrar"].filter(Boolean) as string[] : [];
    return {
      id: text(row.id),
      email: text(row.email),
      state: row.active && row.sync_status !== "disconnected" ? "connected" as const : "action_required" as const,
      permissions,
    };
  });
  const gmailState = gmailAccounts.some((account) => account.state === "connected")
    ? "connected" as const
    : process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET ? "action_required" as const : "not_configured" as const;
  const minimaxState = process.env.MINIMAX_API_KEY && process.env.MINIMAX_MODEL ? "connected" as const : "not_configured" as const;
  const hunterState = process.env.HUNTER_API_KEY ? "connected" as const : "not_configured" as const;
  const vaultSecret = (id: string, name: string, configured: boolean, unavailable = false) => ({
    id,
    name,
    state: unavailable ? "unavailable" as const : configured ? "connected" as const : "not_configured" as const,
    canReveal: isOwner && configured && !unavailable,
    canReplace: isOwner,
  });
  return {
    isDemo: false,
    team: ((teamResult.data ?? []) as Row[]).map((row) => ({
      id: text(row.user_id), name: text(relation(row.profiles)?.display_name, "Usuario"),
      role: row.role === "owner" ? "Propietario" : "Miembro", status: row.status === "active" ? "Activo" : "Invitado",
    })),
    mailProviders: [
      { id: "gmail", name: "Gmail", state: gmailState, accounts: gmailAccounts },
      { id: "microsoft", name: "Microsoft 365", state: "unavailable", accounts: [] },
    ],
    integrations: [
      { id: "minimax", name: "MiniMax", detail: "Investigación y redacción asistida", state: minimaxState },
      { id: "hunter", name: "Hunter", detail: "Búsqueda y verificación de contactos", state: hunterState },
    ],
    vault: [
      vaultSecret("supabase-database", "Contraseña de base de datos Supabase", Boolean(process.env.SUPABASE_DB_PASSWORD), !process.env.SUPABASE_DB_PASSWORD),
      vaultSecret("gmail-oauth", "Secreto OAuth de Gmail", Boolean(process.env.GMAIL_CLIENT_SECRET)),
      vaultSecret("microsoft-oauth", "Secreto OAuth de Microsoft", Boolean(process.env.MICROSOFT_CLIENT_SECRET)),
      vaultSecret("minimax-api", "Clave API de MiniMax", Boolean(process.env.MINIMAX_API_KEY)),
      vaultSecret("hunter-api", "Clave API de Hunter", Boolean(process.env.HUNTER_API_KEY)),
    ],
  };
}

export type V2MigrationReview = {
  projects: Array<{ id: string; name: string; ownerUserId: string; ownerName: string; institutionId: string; institutionName: string; status: string }>;
  owners: Array<{ id: string; name: string }>;
  institutions: Array<{ id: string; name: string }>;
  quarantine: Array<{ reason: string; count: number }>;
};

export async function getV2MigrationReview(): Promise<V2MigrationReview> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return { projects: [], owners: [], institutions: [], quarantine: [] };
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Se requiere una sesión válida");
  const { data: membership } = await supabase.from("workspace_members").select("workspace_id").eq("user_id", auth.user.id).eq("status", "active").limit(1).maybeSingle();
  if (!membership) throw new Error("El usuario no pertenece a un workspace");
  const [projectsResult, ownersResult, institutionsResult, quarantineResult] = await Promise.all([
    supabase.from("projects").select("id,name,owner_user_id,institution_id,status,owner:profiles!projects_owner_user_id_fkey(display_name),institution:institutions(name)").eq("workspace_id", membership.workspace_id).not("legacy_campaign_id", "is", null).order("name"),
    supabase.from("workspace_members").select("user_id,profiles(display_name)").eq("workspace_id", membership.workspace_id).eq("status", "active"),
    supabase.from("institutions").select("id,name").eq("workspace_id", membership.workspace_id).order("name"),
    supabase.from("legacy_quarantine").select("reason").eq("workspace_id", membership.workspace_id).eq("review_status", "pending"),
  ]);
  const error = projectsResult.error ?? ownersResult.error ?? institutionsResult.error ?? quarantineResult.error;
  if (error) throw new Error(error.message);
  const counts = new Map<string, number>();
  for (const row of (quarantineResult.data ?? []) as Row[]) counts.set(text(row.reason, "Sin motivo"), (counts.get(text(row.reason, "Sin motivo")) ?? 0) + 1);
  return {
    projects: ((projectsResult.data ?? []) as Row[]).map((row) => ({
      id: text(row.id), name: text(row.name), ownerUserId: text(row.owner_user_id), ownerName: text(relation(row.owner)?.display_name, "Sin propietario"),
      institutionId: text(row.institution_id), institutionName: text(relation(row.institution)?.name, "Sin institución"), status: text(row.status),
    })),
    owners: ((ownersResult.data ?? []) as Row[]).map((row) => ({ id: text(row.user_id), name: text(relation(row.profiles)?.display_name, "Usuario") })),
    institutions: ((institutionsResult.data ?? []) as Row[]).map((row) => ({ id: text(row.id), name: text(row.name) })),
    quarantine: [...counts].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
  };
}
