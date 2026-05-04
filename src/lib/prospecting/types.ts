export type CampaignContactStatus =
  | "new"
  | "needs_research"
  | "qualified"
  | "ready_to_draft"
  | "draft_ready"
  | "approved_to_send"
  | "sent"
  | "replied"
  | "followup_due"
  | "closed_positive"
  | "closed_negative"
  | "do_not_contact";

export type MessageStatus =
  | "needs_review"
  | "approved"
  | "rejected"
  | "sent"
  | "failed";

export type SenderStatus = "active" | "paused" | "disabled";

export type DuplicateReason = "domain" | "name";

export type DuplicateMatch = {
  companyId: string;
  reason: DuplicateReason;
  confidence: number;
};

export type CompanyCandidate = {
  id?: string;
  name: string;
  domain: string | null;
};

export type ContactProfile = {
  name: string;
  role: string | null;
  email: string | null;
  isDecisionMaker: boolean;
  notes: string | null;
  sources: string[];
};

export type ContactPriorityInput = {
  role: string | null;
  isDecisionMaker: boolean;
  confidence: number;
};

export type CampaignSender = {
  id: string;
  email: string;
  displayName: string;
  isDefault: boolean;
  priority: number;
  dailyLimit: number;
  sentToday: number;
  status: SenderStatus;
};

export type SendGuardInput = {
  messageStatus: MessageStatus;
  contactDoNotContact: boolean;
  companyDoNotContact: boolean;
  hasSenderAccount: boolean;
};

export type SendGuardResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "message_not_approved"
        | "contact_do_not_contact"
        | "company_do_not_contact"
        | "missing_sender_account";
    };
