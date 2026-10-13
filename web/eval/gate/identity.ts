/** Hash generation inputs, not version labels, secrets, or customer content. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { groqChatBody, GROQ_CHAT_URL } from "../../src/lib/ai/providers/groq";
import { detectRouteVersion, detectProviderExecutionConfig } from "../../src/lib/detect-llm";
export type CandidateIdentity = { source_sha: string; prompt_sha256: string; config_sha256: string; request_config_sha256: string };
const root = fileURLToPath(new URL("../../..", import.meta.url));
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
/** Ingest-only. Not applied when a model request is built. */
const INGEST_ONLY_REDACTION = new Set(["scrubCustomerName"]);

function requestRedactionSource(sourceText: string): string {
  const source = ts.createSourceFile("redact.ts", sourceText, ts.ScriptTarget.Latest, true);
  const printer = ts.createPrinter({ removeComments: true });
  return source.statements
    .filter(node => !(ts.isFunctionDeclaration(node) && node.name && INGEST_ONLY_REDACTION.has(node.name.text)))
    .map(node => printer.printNode(ts.EmitHint.Unspecified, node, source))
    .join("\n");
}

export function promptConstructionHash(read: (path: string) => string): string {
  const source = ts.createSourceFile("detect.ts", read("web/src/lib/detect-llm.ts"), ts.ScriptTarget.Latest, true);
  const printer = ts.createPrinter({ removeComments: true });
  const nodes = source.statements.filter(node =>
    (ts.isFunctionDeclaration(node) && node.name?.text === "classifyChatMessages") ||
    (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(source) === "SYSTEM_PROMPT")));
  if (nodes.length !== 2) throw new Error("prompt_identity_unavailable");
  return hash(JSON.stringify({ builder: nodes.map(n => printer.printNode(ts.EmitHint.Unspecified, n, source)),
    transcript: read("web/src/lib/recent-transcript.ts"), redaction: requestRedactionSource(read("web/src/lib/redact.ts")) }));
}
export function requestConfigurationHash(): string {
  const route = detectRouteVersion();
  const models = route.slice(route.indexOf(":", 7) + 1).split("|");
  return hash(JSON.stringify({ endpoint: GROQ_CHAT_URL, route, bodies: models.map(model => groqChatBody(model, [])) }));
}
export function candidateIdentity(): CandidateIdentity {
  const request = requestConfigurationHash();
  return {
    source_sha: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    prompt_sha256: promptConstructionHash(path => readFileSync(`${root}/${path}`, "utf8")),
    config_sha256: hash(JSON.stringify({ request, execution: detectProviderExecutionConfig() })),
    request_config_sha256: request,
  };
}
export function verifyCaptureIdentity(fixture: { item_id: string; identity?: CandidateIdentity; capture_sha256?: string }): boolean {
  const current = candidateIdentity();
  const identity = fixture.identity;
  if (identity) return /^[a-f0-9]{40}$/.test(identity.source_sha) &&
    identity.prompt_sha256 === current.prompt_sha256 && identity.config_sha256 === current.config_sha256 &&
    identity.request_config_sha256 === current.request_config_sha256;
  if (!fixture.capture_sha256) return false;
  try {
    // Historical evidence establishes request generation, not unrecorded retry
    // environment. This exception is synthetic replay only, never live promotion.
    const legacy = JSON.parse(readFileSync(new URL("./legacy-provenance.json", import.meta.url), "utf8")) as {
      request_identity: Pick<CandidateIdentity, "source_sha" | "prompt_sha256" | "request_config_sha256">; captures: Record<string, string> };
    return legacy.captures[fixture.item_id] === fixture.capture_sha256 &&
      /^[a-f0-9]{40}$/.test(legacy.request_identity.source_sha) &&
      legacy.request_identity.prompt_sha256 === current.prompt_sha256 &&
      legacy.request_identity.request_config_sha256 === current.request_config_sha256;
  } catch { return false; }
}
