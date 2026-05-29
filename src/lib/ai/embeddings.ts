const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
export const OPENAI_EMBEDDING_DIMENSIONS = 1536;

export type EmbeddingResult =
  | {
      embedding: number[];
      model: string;
      ok: true;
    }
  | {
      error: string;
      model: string;
      ok: false;
    };

export function getEmbeddingModel() {
  return process.env.OPENAI_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;
}

export function hasEmbeddingConfig() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export async function createEmbedding(input: string): Promise<EmbeddingResult> {
  const model = getEmbeddingModel();
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const text = normalizeEmbeddingInput(input);

  if (!apiKey) {
    return { error: "Missing OPENAI_API_KEY.", model, ok: false };
  }

  if (!text) {
    return { error: "Empty embedding input.", model, ok: false };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: text,
        model,
      }),
    });
    const data = await response.json().catch(() => ({}));
    const embedding = data?.data?.[0]?.embedding;

    if (!response.ok || !Array.isArray(embedding)) {
      return {
        error:
          readOpenAiError(data) ||
          `OpenAI embeddings failed with status ${response.status}.`,
        model,
        ok: false,
      };
    }

    if (embedding.length !== OPENAI_EMBEDDING_DIMENSIONS) {
      return {
        error: `Embedding dimension mismatch: expected ${OPENAI_EMBEDDING_DIMENSIONS}, got ${embedding.length}.`,
        model,
        ok: false,
      };
    }

    return { embedding: embedding.map(Number), model, ok: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unknown embedding error.",
      model,
      ok: false,
    };
  }
}

export function normalizeEmbeddingInput(input: string) {
  return input.replace(/\s+/g, " ").trim().slice(0, 12_000);
}

function readOpenAiError(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const error = (data as { error?: unknown }).error;
  if (!error || typeof error !== "object") return "";
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : "";
}
