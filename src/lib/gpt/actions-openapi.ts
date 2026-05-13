type OpenApiOperation = {
  operationId: string;
  summary: string;
  description?: string;
  parameters?: Array<Record<string, unknown>>;
  requestBody?: Record<string, unknown>;
  responses: Record<string, unknown>;
  security?: Array<Record<string, string[]>>;
  "x-openai-isConsequential"?: boolean;
};

export type GptActionsOpenApiSchema = {
  openapi: "3.1.0";
  info: {
    title: string;
    description: string;
    version: string;
  };
  servers: Array<{ url: string }>;
  paths: Record<string, Record<string, OpenApiOperation>>;
  components: Record<string, unknown>;
};

export function buildGptActionsOpenApiSchema(
  baseUrl = getDefaultBaseUrl(),
): GptActionsOpenApiSchema {
  const security = [{ bearerAuth: [] }];
  const okResponse = {
    description: "Successful Enterprise Lookout response",
  };

  return {
    openapi: "3.1.0",
    info: {
      title: "Enterprise Lookout GPT Actions",
      description:
        "Actions for a Custom GPT to create, claim, process and complete Enterprise Lookout prospecting tasks.",
      version: "1.0.0",
    },
    servers: [{ url: baseUrl }],
    paths: {
      "/api/gpt/campaigns": {
        get: {
          operationId: "listCampaigns",
          summary: "List campaigns available to the GPT.",
          responses: { "200": okResponse },
          security,
          "x-openai-isConsequential": false,
        },
      },
      "/api/gpt/campaigns/{campaignId}/workspace": {
        get: {
          operationId: "getCampaignWorkspace",
          summary: "Get campaign context, active tasks and remembered writing rules.",
          parameters: [
            pathParam("campaignId", "Campaign UUID or slug."),
          ],
          responses: { "200": okResponse },
          security,
          "x-openai-isConsequential": false,
        },
      },
      "/api/gpt/jobs/create": {
        post: {
          operationId: "createGptJob",
          summary: "Create a task for GPT, Dom or Codex workers.",
          requestBody: jsonBody({
            type: "object",
            required: ["description"],
            properties: {
              campaign_id: stringSchema("Campaign UUID or slug."),
              task_type: stringSchema(
                "Workflow type, e.g. company_research, first_email, redraft_email, contact_research, reply_triage, project_context_refinement.",
              ),
              description: stringSchema("Clear user-facing task description."),
              instructions: stringSchema("Additional user instructions or feedback."),
              object_type: stringSchema("Optional related object type."),
              object_id: stringSchema("Optional related object id."),
              priority: {
                type: "string",
                enum: ["low", "normal", "high", "urgent"],
                default: "normal",
              },
            },
          }),
          responses: { "200": okResponse },
          security,
          "x-openai-isConsequential": false,
        },
      },
      "/api/gpt/jobs/claim": {
        post: {
          operationId: "claimNextGptJobs",
          summary: "Claim pending tasks with a short lock to avoid duplicate work.",
          requestBody: jsonBody({
            type: "object",
            properties: {
              campaign_id: stringSchema("Optional campaign UUID or slug filter."),
              worker_id: stringSchema("Stable identifier for this GPT conversation."),
              task_types: {
                type: "array",
                items: { type: "string" },
                description: "Optional workflow types to claim.",
              },
              limit: {
                type: "integer",
                minimum: 1,
                maximum: 10,
                default: 3,
              },
            },
          }),
          responses: { "200": okResponse },
          security,
          "x-openai-isConsequential": false,
        },
      },
      "/api/gpt/jobs/{jobId}/context": {
        get: {
          operationId: "getGptJobContext",
          summary: "Get all structured context needed to process one task.",
          parameters: [pathParam("jobId", "Task UUID.")],
          responses: { "200": okResponse },
          security,
          "x-openai-isConsequential": false,
        },
      },
      "/api/gpt/jobs/{jobId}/progress": {
        post: {
          operationId: "updateGptJobProgress",
          summary:
            "Report user-visible progress before, during and after GPT work.",
          description:
            "Use this for every claimed job: first acknowledge work, then report research/drafting/review steps with Spanish messages and result previews when available.",
          parameters: [pathParam("jobId", "Task UUID.")],
          requestBody: jsonBody({
            type: "object",
            required: ["status"],
            properties: {
              status: {
                type: "string",
                enum: [
                  "in_progress",
                  "researching",
                  "drafting",
                  "reviewing",
                  "completed",
                  "failed",
                ],
              },
              step: stringSchema("Short machine-readable step."),
              message: stringSchema("User-visible progress message."),
              percent: { type: "integer", minimum: 0, maximum: 100 },
              result_preview: stringSchema("Short preview of current result."),
            },
          }),
          responses: { "200": okResponse },
          security,
          "x-openai-isConsequential": false,
        },
      },
      "/api/gpt/jobs/{jobId}/result": {
        post: {
          operationId: "submitGptJobResult",
          summary: "Complete or fail a claimed task and save structured output.",
          parameters: [pathParam("jobId", "Task UUID.")],
          requestBody: jsonBody({
            type: "object",
            properties: {
              status: {
                type: "string",
                enum: ["completed", "reviewing", "failed"],
                default: "completed",
              },
              result: {
                description:
                  "Human-readable or structured result. Prefer putting actions in the top-level actions field, not inside result.",
              },
              company_candidates: {
                type: "array",
                description: "Company candidates for user review.",
                items: { type: "object" },
              },
              actions: {
                type: "array",
                description:
                  "Top-level Dom-compatible actions, e.g. create_draft, update_reply_draft, or create_task. Do not wrap these inside result.",
                items: { type: "object" },
              },
              message: stringSchema("Optional chat-style response to store."),
            },
          }),
          responses: { "200": okResponse },
          security,
          "x-openai-isConsequential": false,
        },
      },
      "/api/gpt/memory/rules": {
        get: {
          operationId: "listMemoryRules",
          summary: "List active style, scoring and workflow rules.",
          parameters: [
            queryParam("campaign_id", "Optional campaign UUID or slug."),
            queryParam("rule_type", "Optional rule type filter."),
          ],
          responses: { "200": okResponse },
          security,
          "x-openai-isConsequential": false,
        },
        post: {
          operationId: "createMemoryRule",
          summary: "Create a remembered rule from user feedback.",
          requestBody: jsonBody({
            type: "object",
            required: ["rule_text"],
            properties: {
              campaign_id: stringSchema("Optional campaign UUID or slug."),
              rule_type: stringSchema(
                "Rule category, e.g. tone, avoid, prefer, cta, length, scoring, workflow.",
              ),
              rule_text: stringSchema("Normalized reusable rule."),
              scope: {
                type: "string",
                enum: ["global", "campaign", "company", "contact", "sender"],
                default: "campaign",
              },
              source: stringSchema("Where this rule came from."),
              confidence: { type: "number", minimum: 0, maximum: 1, default: 0.8 },
            },
          }),
          responses: { "200": okResponse },
          security,
          "x-openai-isConsequential": false,
        },
      },
    },
    components: {
      schemas: {},
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description:
            "Use the same AGENT_API_TOKEN configured for Enterprise Lookout agent access.",
        },
      },
    },
  };
}

function getDefaultBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    "https://enterprise-lookout.vercel.app"
  ).replace(/\/+$/, "");
}

function pathParam(name: string, description: string) {
  return {
    name,
    in: "path",
    required: true,
    description,
    schema: { type: "string" },
  };
}

function queryParam(name: string, description: string) {
  return {
    name,
    in: "query",
    required: false,
    description,
    schema: { type: "string" },
  };
}

function stringSchema(description: string) {
  return { type: "string", description };
}

function jsonBody(schema: Record<string, unknown>) {
  return {
    required: true,
    content: {
      "application/json": {
        schema,
      },
    },
  };
}
