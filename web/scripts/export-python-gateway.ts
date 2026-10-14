/** Regenerate only from reviewed web sources/replays. Run from repository root. */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runHybridDetection, parseLlmClassificationJson, classifyChatMessages } from "../src/lib/detect-llm";
import { runDetection } from "../src/lib/detect";
import { redactText } from "../src/lib/redact";
import { recentCustomerTranscript } from "../src/lib/recent-transcript";
import type { Conversation, Message, Signal } from "../src/lib/types";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const write = (p: string, value: unknown) => fs.writeFileSync(path.join(root, p), JSON.stringify(value, null, 2) + "\n");

async function main() {
  fs.mkdirSync(path.join(root, "work"), { recursive: true });
  const temp = fs.mkdtempSync(path.join(root, "work/cb11-port-"));
  try {
    for (const [file, exports] of [
      ["taxonomy", ""],
      ["detect-patterns", "export { PATTERNS_BY_TYPE, FRAUD_COMPLAINT_PATTERNS };"],
      ["redact", "export { EMAIL_RE, UPI_RE, PAN_RE, IFSC_RE, AADHAAR_SPACED_RE, PHONE_RE, AADHAAR_COMPACT_RE, ACCOUNT_RE, LABELED_CLIENT_RE, CLIENT_CODE_RE, DOB_RE, ADDRESS_RE, PIN_RE };"],
    ]) fs.writeFileSync(path.join(temp, `${file}.ts`), read(`web/src/lib/${file}.ts`) + "\n" + exports);
    const load = async (name: string) => {
      const module = await import(pathToFileURL(path.join(temp, `${name}.ts`)).href);
      return module.default ?? module;
    };
    const taxonomy = await load("taxonomy");
    const patterns = await load("detect-patterns");
    const privacy = await load("redact");
    write("backend/app/ai/heuristics.json", { taxonomy: taxonomy.getEffectiveTaxonomy(),
      patterns: Object.fromEntries(Object.entries(patterns.PATTERNS_BY_TYPE).map(([key, rows]) =>
        [key, (rows as { re: RegExp }[]).map(row => row.re.source)])),
      fraud: patterns.FRAUD_COMPLAINT_PATTERNS.map((r: RegExp) => r.source) });
    const names = ["EMAIL", "UPI", "PAN", "IFSC", "AADHAAR_SPACED", "PHONE", "AADHAAR_COMPACT", "ACCOUNT", "LABELED_CLIENT", "CLIENT_CODE", "DOB", "ADDRESS", "PIN"];
    const tokens = ["email", "upi", "pan", "ifsc", "aadhaar", "phone", "aadhaar", "account", "clientCode", "clientCode", "dob", "address", "pin"];
    write("backend/app/ai/redaction.json", names.map((name, i) => ({ pattern: privacy[`${name}_RE`].source,
      flags: privacy[`${name}_RE`].flags, token: privacy.REDACTION_TOKENS[tokens[i]] })));
    const prompt = /export const SYSTEM_PROMPT = `([\s\S]*?)`;/.exec(read("web/src/lib/detect-llm.ts"))![1];
    fs.writeFileSync(path.join(root, "backend/app/ai/system-prompt.txt"), prompt);
    fs.writeFileSync(path.join(root, "web/eval/promptfoo/system-prompt.txt"), prompt);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }

  const rows = [];
  for (const item of read("web/eval/gold/validation/items.jsonl").trim().split("\n").map(line => JSON.parse(line))) {
    const messages: Message[] = item.messages.map((m: { role: Message["role"]; content: string }, i: number) => ({
      ...m, id: `msg_${item.id}_${i}`, conversationId: item.id, content: redactText(m.content), timestamp: "2026-01-01T00:00:00.000Z",
    }));
    const conversation: Conversation = { id: item.id, tenantId: item.tenantId, channel: item.channel,
      customerName: item.customerName, startedAt: "2026-01-01T00:00:00.000Z", messageIds: messages.map(m => m.id) };
    const replay = JSON.parse(read(`web/eval/gate/replay/detect_primary_qwen_qwen3.8-27b_openai_gpt-oss-20b/${item.id}.json`));
    const result = await runHybridDetection([conversation], messages, item.tenantId, undefined, {
      classify: async () => parseLlmClassificationJson(replay.content), maxCalls: 120,
    });
    const view = (signals: Signal[]) => signals.map(s => ({ signal_type: s.type, confidence: s.confidence,
      summary: s.summary, evidence: s.evidence, urgency: s.urgency,
      ...(s.urgencyTimeframe ? { urgency_timeframe: s.urgencyTimeframe } : {}),
      ...(s.mentionedValueInr != null ? { mentioned_value_inr: s.mentionedValueInr } : {}) }));
    const recent = recentCustomerTranscript(messages);
    rows.push({ id: item.id, conversation, messages, replay: replay.content, parsed: parseLlmClassificationJson(replay.content),
      heuristic: view(runDetection([conversation], messages, item.tenantId)), output: view(result.signals),
      userPrompt: classifyChatMessages({ customerName: item.customerName, channel: item.channel,
        customerText: recent.text, omittedTurns: recent.context.omittedTurns })[1].content });
  }
  write("backend/tests/fixtures/cb11-gateway-parity.json", rows);
  const sources = ["detect.ts", "detect-llm.ts", "detect-patterns.ts", "taxonomy.ts", "redact.ts", "recent-transcript.ts", "clip-quote.ts", "signal-commercial.ts"].map(name => `web/src/lib/${name}`);
  sources.push("web/eval/gold/validation/items.jsonl");
  write("backend/tests/fixtures/cb11-port-source-checksums.json", Object.fromEntries(sources.map(p => [p, createHash("sha256").update(read(p)).digest("hex")])));
}
main().catch(() => { console.error("Gateway export failed"); process.exitCode = 1; });
