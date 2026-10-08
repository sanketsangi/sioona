import type { BackendPrediction } from "./backend-client";
import type { Signal } from "./types";

export type EvidenceStatus = "valid" | "unresolved" | "stale";

export function collapseDisplayQuote(quote: string): string {
  return quote.split(/\s+/).filter(Boolean).join(" ");
}

/** Drop JSON quotes unless the server marked the anchor valid. */
export function quarantineDisplayEvidence<T extends Signal>(signal: T): T {
  if (signal.evidenceStatus === "valid") return signal;
  return {
    ...signal,
    evidence: [],
    evidenceStatus:
      signal.evidenceStatus === "stale" ? "stale" : "unresolved",
    evidenceSpans:
      signal.evidenceStatus === "stale"
        ? (signal.evidenceSpans ?? []).map((span) => ({ ...span, quote: null }))
        : [],
  };
}

const EVIDENCE_ANNOTATION_PREFIXES = [
  "llm: ",
  "keyword: ",
  "phrase: ",
  "suppressed: ",
] as const;

function evidenceAnnotations(evidence: string[]): string[] {
  return evidence.filter((item) =>
    EVIDENCE_ANNOTATION_PREFIXES.some((prefix) => item.startsWith(prefix)),
  );
}

/** Server spans replace local quotes. Missing anchor fields fail closed on Neon rows. */
export function serverEvidenceFromPrediction(
  row: BackendPrediction,
): Pick<Signal, "evidence" | "evidenceStatus" | "evidenceSpans"> | null {
  if (
    !Object.prototype.hasOwnProperty.call(row, "evidence_status") &&
    !Array.isArray(row.evidence_spans)
  ) {
    return null;
  }
  const spans = (row.evidence_spans ?? [])
    .filter(
      (span) =>
        typeof span.message_id === "string" &&
        span.message_id.length > 0 &&
        Number.isInteger(span.start) &&
        Number.isInteger(span.end) &&
        span.end > span.start &&
        span.start >= 0,
    )
    .map((span) => ({
      messageId: span.message_id,
      start: span.start,
      end: span.end,
      quote: typeof span.quote === "string" ? span.quote : null,
    }));
  if (row.evidence_status === "valid") {
    const quoted = spans.filter((span) => span.quote);
    if (quoted.length === 0) {
      return { evidence: [], evidenceStatus: "unresolved", evidenceSpans: [] };
    }
    return {
      evidence: quoted.map(
        (span) => `quote: "${collapseDisplayQuote(span.quote ?? "")}"`,
      ),
      evidenceStatus: "valid",
      evidenceSpans: quoted,
    };
  }
  if (row.evidence_status === "stale") {
    return {
      evidence: [],
      evidenceStatus: "stale",
      evidenceSpans: spans.map((span) => ({ ...span, quote: null })),
    };
  }
  return { evidence: [], evidenceStatus: "unresolved", evidenceSpans: [] };
}

/** Quotes a stale or unresolved anchor must not feed into a reply or draft. */
/** Do not reuse detect-time suggestedAction prose when anchors are unavailable. */
export function suggestedActionFallback(
  signal: Pick<Signal, "suggestedAction" | "evidenceStatus">,
): string {
  if (
    signal.evidenceStatus === "stale" ||
    signal.evidenceStatus === "unresolved"
  ) {
    return "";
  }
  return signal.suggestedAction;
}

export function evidenceQuotesForDisplay(
  signal: Pick<Signal, "evidence" | "evidenceStatus">,
): string[] {
  if (
    signal.evidenceStatus === "stale" ||
    signal.evidenceStatus === "unresolved"
  ) {
    return [];
  }
  return signal.evidence;
}

export function withServerEvidence<T extends Signal>(
  signal: T,
  row: BackendPrediction,
): T {
  const server = serverEvidenceFromPrediction(row);
  if (server) {
    if (server.evidenceStatus === "valid") {
      return {
        ...signal,
        ...server,
        evidence: [...server.evidence, ...evidenceAnnotations(signal.evidence)],
      };
    }
    return { ...signal, ...server };
  }
  const neonBound =
    (signal.backendSignalId != null && signal.backendSignalId === row.id) ||
    Object.prototype.hasOwnProperty.call(row, "evidence_status") ||
    Array.isArray(row.evidence_spans);
  if (neonBound) {
    return quarantineDisplayEvidence({
      ...signal,
      backendSignalId: row.id,
    });
  }
  return quarantineDisplayEvidence(signal);
}
