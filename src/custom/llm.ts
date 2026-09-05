// The one LLM seam for drafts and plan prose. OpenRouter when a key exists
// (any model slug; Claude by default), otherwise Workers AI through the custom
// Worker's AI binding, otherwise null so callers fall back to templates.
// Plain fetch on purpose: no SDK in the bundle (vite-plugin-lean-worker-bundle
// polices the app graph, and the custom Worker has no reason to carry one).

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-sonnet-4.5";
const DEFAULT_WORKERS_AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export type LlmRequest = {
  system: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
};

export type LlmProvider = "openrouter" | "workers-ai" | "none";

export function llmProvider(env: Cloudflare.Env): LlmProvider {
  if (env.OPENROUTER_API_KEY?.trim()) return "openrouter";
  if (env.AI) return "workers-ai";
  return "none";
}

export async function generateText(
  env: Cloudflare.Env,
  request: LlmRequest,
): Promise<string | null> {
  const provider = llmProvider(env);
  const maxTokens = request.maxTokens ?? 700;
  const temperature = request.temperature ?? 0.4;

  if (provider === "openrouter") {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": env.CUSTOM_APP_URL ?? "https://openseo.so",
        "X-Title": "OpenSEO fork",
      },
      body: JSON.stringify({
        model: env.CUSTOM_LLM_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL,
        max_tokens: maxTokens,
        temperature,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.prompt },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      console.error("[custom:llm] openrouter error", response.status);
      return null;
    }
    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return json.choices?.[0]?.message?.content?.trim() ?? null;
  }

  if (provider === "workers-ai" && env.AI) {
    const model = env.CUSTOM_AI_MODEL?.trim() || DEFAULT_WORKERS_AI_MODEL;
    try {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Workers AI's model union is too wide to name a single overload.
      const result = (await env.AI.run(model as Parameters<Ai["run"]>[0], {
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.prompt },
        ],
        max_tokens: maxTokens,
        temperature,
      })) as { response?: string } | string;
      const text = typeof result === "string" ? result : result?.response;
      return text?.trim() || null;
    } catch (error) {
      console.error("[custom:llm] workers ai error", error);
      return null;
    }
  }

  return null;
}

/** Ask for JSON and parse it; null on any failure so callers keep a template
 *  fallback. Strips code fences models like to add. */
export async function generateJson<T>(
  env: Cloudflare.Env,
  request: LlmRequest,
): Promise<T | null> {
  const text = await generateText(env, {
    ...request,
    system: `${request.system}\nRespond with a single JSON object and nothing else.`,
  });
  if (!text) return null;
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}
