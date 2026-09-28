import {
  buildGroqDetectChatBody,
  GROQ_CHAT_URL,
  type DetectClassifierTurn,
} from "../../src/lib/detect-llm";

type ProviderOptions = {
  id?: string;
  config?: {
    timeoutMs?: number;
  };
  env?: Record<string, string | undefined>;
};

type CallResult = {
  output?: string;
  error?: string;
};

const DEFAULT_TIMEOUT_MS = 25_000;

function readEnv(
  options: ProviderOptions | undefined,
  name: string
): string | undefined {
  const fromProvider = options?.env?.[name];
  if (typeof fromProvider === "string" && fromProvider.trim()) {
    return fromProvider.trim();
  }
  const fromProcess = process.env[name];
  if (typeof fromProcess === "string" && fromProcess.trim()) {
    return fromProcess.trim();
  }
  return undefined;
}

function asTurns(value: unknown): DetectClassifierTurn[] | null {
  if (!Array.isArray(value)) return null;
  const turns: DetectClassifierTurn[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if (role !== "customer" && role !== "agent" && role !== "system") {
      return null;
    }
    if (typeof content !== "string") return null;
    turns.push({ role, content });
  }
  return turns;
}

/**
 * Promptfoo provider. Builds the same Groq chat body as
 * classifyConversationWithGroq and returns the raw message content
 * so assertions can grade the JSON contract.
 */
export default class SioonaGroqDetectProvider {
  constructor(private readonly options: ProviderOptions = {}) {}

  id(): string {
    return "groq-qwen-detect";
  }

  async callApi(
    _prompt: string,
    context?: { vars?: Record<string, unknown> }
  ): Promise<CallResult> {
    const apiKey = readEnv(this.options, "GROQ_API_KEY");
    if (!apiKey) {
      return {
        error:
          "GROQ_API_KEY is not set. Add it to web/.env or the environment, then rerun npm run eval.",
      };
    }

    const vars = context?.vars ?? {};
    const messages = asTurns(vars.messages);
    if (!messages) {
      return {
        error:
          "Test var `messages` must be a list of {role, content} turns.",
      };
    }

    const body = buildGroqDetectChatBody({
      customerName:
        typeof vars.customer_name === "string" ? vars.customer_name : null,
      channel: typeof vars.channel === "string" ? vars.channel : null,
      messages,
      model: readEnv(this.options, "DETECT_LLM_MODEL"),
    });
    if (!body) {
      return { error: "No customer text to classify." };
    }

    const timeoutMs =
      typeof this.options.config?.timeoutMs === "number" &&
      this.options.config.timeoutMs > 0
        ? this.options.config.timeoutMs
        : DEFAULT_TIMEOUT_MS;
    // Local stub only. Production Detect v2 always uses GROQ_CHAT_URL.
    const url = readEnv(this.options, "SIOONA_EVAL_GROQ_URL") || GROQ_CHAT_URL;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { error: `Groq request failed: ${message}` };
    }

    if (!response.ok) {
      let detail = "";
      try {
        detail = await response.text();
      } catch {
        detail = "";
      }
      return {
        error: `Groq ${response.status}: ${detail.slice(0, 500)}`,
      };
    }

    let payload: {
      choices?: Array<{ message?: { content?: string } }>;
    };
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      return { error: "Groq response was not JSON." };
    }

    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      return { error: "Groq response missing message.content." };
    }
    return { output: content };
  }
}
