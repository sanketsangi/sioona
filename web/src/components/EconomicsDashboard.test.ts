import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EconomicsDashboard } from "./EconomicsDashboard";
import type { BackendEconomicsDashboard } from "@/lib/backend-client";

const unavailable = { status: "unavailable" as const, reason: "Not in canonical sources." };
const fixture: BackendEconomicsDashboard = {
  tenant_id: "tenant_fixture", from_ts: "2026-10-01T00:00:00Z", to_ts: "2026-10-15T00:00:00Z",
  timezone: "Asia/Kolkata", cost_currency: "USD", influenced_value_currency: "INR",
  funnel: { ingested: 100, processed: 90, surfaced: 12, reviewed: 10, correct: 8, acted: 4, positive_outcomes: 2, influenced_value_inr: "50000", denominators: { ingested: null, processed: 100, surfaced: 90, reviewed: 12, correct: 10, acted: 12, positive_outcomes: 4, influenced_value_inr: 2 }, definitions: { ingested: "Upload jobs", processed: "Completed runs", surfaced: "Active predictions", reviewed: "Feedback", correct: "Correct feedback", acted: "Acted predictions", positive_outcomes: "Retained or converted", influenced_value_inr: "Customer-recorded influence" } },
  quality: { signal_score: .8, reviewed: 10, correct: 8, incorrect: 2, partially_correct: 0, false_positive_rate: .2, evidence_valid: 10, evidence_unresolved: 1, evidence_stale: 1, evidence_failure_rate: 1 / 6, abstained: 3, abstention_rate: .03, by_signal_type: [{ signal_type: "lead", reviewed: 10, correct: 8, acceptance_rate: .8 }], gold_set_precision: unavailable, gold_set_recall: unavailable, calibration: unavailable },
  reliability: { jobs_by_status: { succeeded: 2 }, recovered_jobs: 1, queue_depth: 0, oldest_queue_age_seconds: null, attempts_by_status: { succeeded: 9, timeout: 1 }, retry_or_fallback_attempts: 1, retry_rate: .1, http_429_attempts: 1, error_rate: .1, unfinished_attempts: 0, p50_latency_ms: 120, p95_latency_ms: 400, p50_processing_latency_ms: 1_000, p95_processing_latency_ms: 2_000, ledger_flush_failures: unavailable, reservation_drift: unavailable, database_latency: unavailable, connector_errors: unavailable },
  economics: { attempts: 10, input_tokens: 1000, cached_input_tokens: 200, output_tokens: 100, unknown_usage_count: 1, unknown_usage_rate: .1, unknown_cost_count: 1, unknown_cost_rate: .1, known_cost_coverage: .9, estimated_cost_usd: "1.25", reconciled_cost_usd: "0", known_cost_usd: "1.25", cost_per_processed_conversation_usd: "0.01388889", cost_per_surfaced_signal_usd: "0.10416667", cost_per_correct_signal_usd: "0.15625", cost_per_acted_signal_usd: "0.3125", projections: [{ conversations: 10000, estimated_cost_usd: "138.8889", status: "available", incomplete: true }, { conversations: 50000, estimated_cost_usd: "694.4445", status: "available", incomplete: true }, { conversations: 100000, estimated_cost_usd: "1388.889", status: "available", incomplete: true }] },
  alerts: [{ key: "http_429", label: "Provider 429 responses", status: "alert", owner: "AI Platform", runbook: "Reduce concurrency.", detail: "1 response." }, { key: "database_latency", label: "Database Latency", status: "unavailable", owner: "Backend", runbook: "Add telemetry.", detail: "Not measured." }],
};

describe("EconomicsDashboard", () => {
  it("renders all four panels, projections, alerts, and explicit unavailable states", () => {
    const html = renderToStaticMarkup(React.createElement(EconomicsDashboard, { data: fixture }));
    expect(html).toContain("Funnel");
    expect(html).toContain("Human acceptance rate");
    expect(html).not.toContain("SignalScore");
    expect(html).toContain("Signal quality");
    expect(html).toContain("Reliability");
    expect(html).toContain("Economics");
    expect(html).toContain("10K conversations");
    expect(html).toContain("Incomplete estimate");
    expect(html).toContain("Provider 429 responses");
    expect(html).toContain("Unavailable");
    expect(html).toContain("IST");
  });

  it("does not expose transcript, prompt, quote, or message fields", () => {
    const html = renderToStaticMarkup(React.createElement(EconomicsDashboard, { data: fixture })).toLowerCase();
    for (const forbidden of ["raw transcript", "prompt text", "evidence quote", "message content"]) {
      expect(html).not.toContain(forbidden);
    }
  });
});
