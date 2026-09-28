/**
 * Promptfoo provider: same Groq request as Detect v2
 * (`requestDetectLlmCompletion` + SYSTEM_PROMPT + Qwen JSON mode).
 *
 * Live: GROQ_API_KEY (DETECT_LLM_MODEL optional, default qwen/qwen3.8-27b).
 * Harness-only: PROMPTFOO_DETECT_MOCK=1 (no Groq call).
 */
const fs = require("fs");
const path = require("path");

require("tsx/cjs");

const {
  buildDetectLlmUserPrompt,
  detectLlmModel,
  requestDetectLlmCompletion,
} = require("../../src/lib/detect-llm.ts");

function loadLocalEnv() {
  const webRoot = path.resolve(__dirname, "../..");
  for (const name of [".env", ".env.local"]) {
    const file = path.join(webRoot, name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

function messagesFromVars(vars) {
  const raw = Array.isArray(vars.messages) ? vars.messages : [];
  const conversationId = String(vars.id ?? "conv_eval");
  return raw
    .filter((row) => row && typeof row.content === "string")
    .map((row, index) => ({
      id: `eval_${conversationId}_${index}`,
      conversationId,
      role:
        row.role === "agent" || row.role === "system" ? row.role : "customer",
      content: row.content,
      timestamp: "2026-08-01T00:00:00.000Z",
    }));
}

function mockOutput(vars) {
  const expected = String(vars.expected_signal ?? "none");
  const customer = messagesFromVars(vars)
    .filter((row) => row.role === "customer")
    .map((row) => row.content.trim())
    .filter(Boolean);
  const joined = customer.join(" ");
  const evidence =
    expected === "none" ? "" : joined.slice(0, 140).replace(/\s+$/g, "");
  return JSON.stringify({
    signal: expected,
    confidence: 0.84,
    evidence,
    next_action: expected === "none" ? "none" : "Review in Shadow Mode",
    reason: `Harness mock classified as ${expected}.`,
  });
}

class SioonaDetectLlmProvider {
  constructor(options = {}) {
    this.providerId = options.id || "sioona-detect-llm";
  }

  id() {
    return this.providerId;
  }

  async callApi(_prompt, context) {
    loadLocalEnv();
    const vars = context?.vars ?? {};
    const messages = messagesFromVars(vars);
    const customerMessages = messages.filter((row) => row.role === "customer");
    const conversation = {
      id: String(vars.id ?? "conv_eval"),
      tenantId: "tenant_demo",
      channel: vars.channel || "chat",
      customerName: vars.customerName || "Customer",
      startedAt: "2026-08-01T00:00:00.000Z",
      messageIds: messages.map((row) => row.id),
    };

    if (process.env.PROMPTFOO_DETECT_MOCK === "1") {
      return { output: mockOutput(vars) };
    }

    const userPrompt = buildDetectLlmUserPrompt({
      conversation,
      customerMessages,
    });
    if (!userPrompt) {
      return { error: "No customer text to classify." };
    }
    if (!process.env.GROQ_API_KEY?.trim()) {
      return {
        error:
          "GROQ_API_KEY is required for live evals. Use the same key as Detect v2, or run `npm run eval:mock`.",
      };
    }

    try {
      const { content, reasoning } =
        await requestDetectLlmCompletion(userPrompt);
      const output = (content || "").trim() || (reasoning || "").trim();
      if (!output) {
        return { error: "Groq returned an empty completion." };
      }
      return {
        output,
        metadata: { model: detectLlmModel() },
      };
    } catch (err) {
      const kind =
        err && typeof err === "object" && "kind" in err ? err.kind : null;
      const message =
        err && typeof err === "object" && "message" in err
          ? String(err.message)
          : String(err);
      return {
        error: kind ? `Detect LLM failed (${kind}): ${message}` : message,
      };
    }
  }
}

module.exports = SioonaDetectLlmProvider;
