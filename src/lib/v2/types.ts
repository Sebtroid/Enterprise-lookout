export type ActorOrigin = "user" | "chatgpt" | "minimax" | "gmail" | "system" | "migration";
export type FactStatus = "estimated" | "found" | "verified" | "confirmed" | "disputed" | "stale";

export type V2Project = {
  id: string;
  name: string;
  institution: string;
  ownerName: string;
  accessMode: "personal" | "shared";
  status: "active" | "paused" | "draft";
  goal: number;
  committed: number;
  received: number;
  companies: number;
  nextAction: string;
  eventDate: string | null;
};

export type V2Company = {
  id: string;
  name: string;
  domain: string;
  industry: string;
  fitScore: number;
  factStatus: FactStatus;
  projectNames: string[];
  contactName: string | null;
  contactQuality: "decisor" | "respondió" | "verificado" | "encontrado" | "sin contacto";
  nextAction: string;
};

export type V2Contact = {
  id: string;
  name: string;
  company: string;
  role: string;
  email: string;
  phone: string | null;
  quality: "decisor" | "respondió" | "verificado" | "encontrado" | "obsoleto";
  evidence: string;
  lastInteraction: string;
};

export type V2InboxThread = {
  id: string;
  account: string;
  provider: "gmail" | "microsoft";
  company: string;
  contact: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  unread: boolean;
  project: string;
  messages: Array<{ direction: "inbound" | "outbound"; author: string; body: string; date: string }>;
  advice: string[];
  suggestedReply: string;
  draftId?: string;
  draftStatus?: "draft" | "needs_review" | "approved" | "sending" | "sent" | "failed";
};

export type V2AttentionItem = {
  id: string;
  kind: "approval" | "reply" | "research" | "followup" | "task";
  title: string;
  detail: string;
  project: string;
  owner: string;
  due: string;
  href: string;
};

export type V2WorkspaceSnapshot = {
  workspaceName: string;
  currentUser: string;
  teammates: string[];
  projects: V2Project[];
  companies: V2Company[];
  contacts: V2Contact[];
  threads: V2InboxThread[];
  attention: V2AttentionItem[];
  aiBudget: { spentUsd: number; limitUsd: number };
};
