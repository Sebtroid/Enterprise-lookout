export type DomTaskStatus = "pending" | "in_progress" | "completed" | "blocked";
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
  event: string;
  timestamp: string;
  campaign: DomCampaignContext;
  data: Record<string, unknown>;
  user: DomUser;
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
