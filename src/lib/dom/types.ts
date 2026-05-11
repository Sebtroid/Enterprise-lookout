export type DomTaskStatus =
  | "pending"
  | "received"
  | "in_progress"
  | "researching"
  | "drafting"
  | "reviewing"
  | "completed"
  | "failed";
export type DomChatRole = "user" | "dom" | "system";

export type DomUser = {
  id: string;
  email: string;
};

export type DomCampaignContext = {
  dbId: string;
  id: string;
  name: string;
  organization: string;
  description: string;
  valueProposition: string;
  needs: string[];
  date: string | null;
  status: string;
};

export type DomTask = {
  id: string;
  campaignId: string | null;
  campaignName: string | null;
  description: string;
  status: DomTaskStatus;
  createdBy: "user" | "dom" | "system";
  createdAt: string;
  updatedAt: string;
  context: Record<string, unknown> | null;
  result: string | null;
  chatThreadId: string | null;
  progressStep: string | null;
  progressMessage: string | null;
  progressPercent: number | null;
  resultPreview: string | null;
  lastProgressAt: string | null;
  candidateCount: number;
  pendingCandidateCount: number;
};

export type DomCompanyCandidateStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "needs_more_research";

export type DomSuggestedContact = {
  name: string;
  role: string | null;
  email: string | null;
  confidence: number;
  source: string | null;
};

export type DomCompanyCandidate = {
  id: string;
  taskId: string;
  campaignId: string | null;
  campaignName: string | null;
  companyId: string | null;
  name: string;
  domain: string | null;
  website: string | null;
  industry: string | null;
  region: string | null;
  description: string | null;
  evidenceUrls: string[];
  suggestedContacts: DomSuggestedContact[];
  fitScore: number;
  fitReason: string | null;
  qualityRating: number;
  qualityReason: string | null;
  status: DomCompanyCandidateStatus;
  userFeedback: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DomChatThread = {
  id: string;
  campaignId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DomChatMessage = {
  id: string;
  threadId: string;
  role: DomChatRole;
  content: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type DomWebhookPayload = {
  event_type: string;
  event_id: string;
  timestamp: string;
  payload: Record<string, unknown>;
  campaign_id: string;
  campaign_slug: string;
  user_id: string;
  user_email: string;
  priority: "low" | "normal" | "high" | "urgent";
  campaign: DomCampaignContext;
};

export type DomChatPayload = {
  event: "chat_message";
  thread_id: string;
  campaign: DomCampaignContext;
  message: string;
  history: Array<{ role: DomChatRole; content: string }>;
  tasks: Array<{
    id: string;
    description: string;
    status: DomTaskStatus;
    result: string | null;
  }>;
  user: DomUser;
};

export type DomApiResponse = {
  ok?: boolean;
  message?: string;
  tasks_created?: Array<{
    id?: string;
    description?: string;
    status?: DomTaskStatus;
  }>;
  actions?: Array<Record<string, unknown>>;
};
