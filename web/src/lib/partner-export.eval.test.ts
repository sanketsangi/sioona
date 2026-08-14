import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PARTNER_EXPORT_ADAPT_OVERRIDES } from "../data/fixtures/partner-export-overrides";
import {
  formatPartnerExportEval,
  formatPartnerExportHybridLine,
  formatPartnerExportMetrics,
  loadPartnerExportEval,
  PARTNER_EXPORT_LOCAL_FILE,
  PARTNER_EXPORT_TEMPLATE_FILE,
  resolvePartnerExportPath,
} from "./partner-export-eval";

const tempDirs: string[] = [];

beforeEach(() => {
  vi.stubEnv("DETECT_LLM", "");
  vi.stubEnv("GROQ_API_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

function makeSamplesDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "partner-export-eval-"));
  tempDirs.push(dir);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("real partner export eval lane", () => {
  it("loads the redacted template and reports overall + per-type metrics", async () => {
    const result = await loadPartnerExportEval({ preferTemplate: true });

    expect(result.source).toBe("template");
    expect(result.filename).toBe(PARTNER_EXPORT_TEMPLATE_FILE);
    expect(result.store.conversations.length).toBeGreaterThanOrEqual(4);
    expect(result.metrics.labeledConversations).toBe(
      result.store.conversations.length
    );
    expect(result.heuristic).toEqual(result.metrics);
    expect(result.adapted).toBeNull();
    expect(result.hybrid).toBeNull();
    expect(result.llm.enabled).toBe(false);

    expect(result.metrics.byType).toHaveLength(3);
    for (const type of ["lead", "retention", "upsell"] as const) {
      const row = result.metrics.byType.find((r) => r.type === type);
      expect(row?.labeledCount).toBeGreaterThanOrEqual(1);
      expect(typeof row?.precision === "number" || row?.precision === null).toBe(
        true
      );
      expect(typeof row?.recall === "number" || row?.recall === null).toBe(true);
    }

    // Measurement baseline — do not gate on P/R = 1.0 for real partner exports.
    expect(typeof result.metrics.labeledPrecision).toBe("number");
    expect(typeof result.metrics.labeledRecall).toBe("number");

    const summary = formatPartnerExportMetrics(result.metrics);
    expect(summary).toContain("labeled=");
    expect(summary).toContain("lead:");
    expect(summary).toContain("retention:");
    expect(summary).toContain("upsell:");

    const block = formatPartnerExportEval(result);
    expect(block).toContain("source=template");
    expect(block).toContain("hybrid=skipped");
    expect(
      formatPartnerExportHybridLine(result.heuristic, result.hybrid, result.llm)
    ).toBe("hybrid=skipped");

    // Template is already redacted — no raw phone/email/PAN shapes.
    const joined = result.store.messages.map((m) => m.content).join(" ");
    expect(joined).toMatch(/\[phone\]|\[email\]|\[pan\]/);
    expect(joined).not.toMatch(/\b\d{10}\b/);
    expect(joined).not.toMatch(/[A-Z]{5}\d{4}[A-Z]/i);
  });

  it("prefers gitignored local drop-in when present", async () => {
    const samplesDir = makeSamplesDir();
    writeFileSync(
      path.join(samplesDir, PARTNER_EXPORT_LOCAL_FILE),
      [
        "conversation_id,role,content,customer_name,channel,timestamp,ground_truth",
        'local_lead,customer,"Interested in signing up for a new account — email [email]",Local A,whatsapp,2026-08-06T13:00:00.000Z,lead',
        "local_lead,agent,Sharing onboarding.,,whatsapp,2026-08-06T13:01:00.000Z,lead",
        'local_none,customer,"Please reset my password — OTP missing",Local B,in_app_chat,2026-08-06T14:00:00.000Z,none',
        "local_none,agent,Reset sent.,,in_app_chat,2026-08-06T14:01:00.000Z,none",
      ].join("\n"),
      "utf8"
    );

    const resolved = resolvePartnerExportPath(samplesDir, false);
    expect(resolved.source).toBe("local");
    expect(resolved.filename).toBe(PARTNER_EXPORT_LOCAL_FILE);

    const result = await loadPartnerExportEval({
      samplesDir,
      preferTemplate: false,
      overrides: null,
    });
    expect(result.source).toBe("local");
    expect(result.adapted).toBeNull();
    expect(result.metrics.labeledConversations).toBe(2);
    expect(
      result.metrics.byType.find((r) => r.type === "lead")?.labeledCount
    ).toBe(1);
  });

  it("Adapt overrides flip lead FP / upsell miss without new FPs", async () => {
    const samplesDir = makeSamplesDir();
    writeFileSync(
      path.join(samplesDir, PARTNER_EXPORT_LOCAL_FILE),
      [
        "conversation_id,role,content,customer_name,channel,timestamp,ground_truth",
        'upsell_pr,customer,"Portfolio review please. I am already doing SIPs. Yes, send the link. I want to open/start this week.",Ada,whatsapp,2026-08-06T09:00:00.000Z,upsell',
        "upsell_pr,agent,Sharing notes.,,whatsapp,2026-08-06T09:01:00.000Z,upsell",
        'ret_move,customer,"Need advice on how to invest. I keep money in a savings account and a fixed deposit. If this is not fixed I will move my money.",Ben,whatsapp,2026-08-06T10:00:00.000Z,retention',
        "ret_move,agent,Looking into it.,,whatsapp,2026-08-06T10:01:00.000Z,retention",
        'true_lead,customer,"Want to open a demat account this week — send pricing to [email]",Cara,whatsapp,2026-08-06T11:00:00.000Z,lead',
        "true_lead,agent,Sharing the fee schedule.,,whatsapp,2026-08-06T11:01:00.000Z,lead",
        'ops_none,customer,"Please reset my password — OTP missing",Dev,in_app_chat,2026-08-06T14:00:00.000Z,none',
        "ops_none,agent,Reset sent.,,in_app_chat,2026-08-06T14:01:00.000Z,none",
      ].join("\n"),
      "utf8"
    );

    const base = await loadPartnerExportEval({
      samplesDir,
      overrides: null,
    });
    expect(base.adapted).toBeNull();
    expect(base.heuristic.falsePositives).toBeGreaterThan(0);
    expect(base.heuristic.falseNegatives).toBeGreaterThan(0);

    const adapted = await loadPartnerExportEval({
      samplesDir,
      overrides: PARTNER_EXPORT_ADAPT_OVERRIDES,
    });
    expect(adapted.adapted).not.toBeNull();
    expect(adapted.adapted!.falsePositives).toBeLessThanOrEqual(
      base.heuristic.falsePositives
    );
    expect(adapted.adapted!.truePositives).toBeGreaterThan(
      base.heuristic.truePositives
    );
    expect(adapted.adapted!.falseNegatives).toBeLessThan(
      base.heuristic.falseNegatives
    );

    expect(
      adapted.adaptedConfusion?.find((ex) => ex.externalId === "upsell_pr")
    ).toBeUndefined();
    expect(
      adapted.adaptedConfusion?.find((ex) => ex.externalId === "ret_move")
    ).toBeUndefined();

    const leadRow = adapted.adapted!.byType.find((r) => r.type === "lead");
    const upsellRow = adapted.adapted!.byType.find((r) => r.type === "upsell");
    const retentionRow = adapted.adapted!.byType.find(
      (r) => r.type === "retention"
    );
    expect(leadRow?.truePositives).toBe(1);
    expect(upsellRow?.truePositives).toBe(1);
    expect(retentionRow?.truePositives).toBe(1);
    expect(adapted.adapted!.falsePositives).toBe(0);
  });

  it("injected classify lifts recall on a miss conversation without extra FP", async () => {
    const samplesDir = makeSamplesDir();
    writeFileSync(
      path.join(samplesDir, PARTNER_EXPORT_LOCAL_FILE),
      [
        "conversation_id,role,content,customer_name,channel,timestamp,ground_truth",
        'hit_lead,customer,"Want to open a demat account this week — send pricing to [email]",Hit A,whatsapp,2026-08-06T09:00:00.000Z,lead',
        "hit_lead,agent,Sharing the fee schedule.,,whatsapp,2026-08-06T09:01:00.000Z,lead",
        'miss_ret,customer,"The service has been fine but I keep wondering if I should take my business somewhere else after this quarter. Nothing urgent.",Miss B,intercom,2026-08-06T10:00:00.000Z,retention',
        "miss_ret,agent,Noted — anything we can help with?,,intercom,2026-08-06T10:01:00.000Z,retention",
        'ops_none,customer,"Please reset my password — OTP missing",Ops C,in_app_chat,2026-08-06T14:00:00.000Z,none',
        "ops_none,agent,Reset sent.,,in_app_chat,2026-08-06T14:01:00.000Z,none",
      ].join("\n"),
      "utf8"
    );

    const heuristicOnly = await loadPartnerExportEval({
      samplesDir,
      overrides: null,
    });
    expect(heuristicOnly.heuristic.falseNegatives).toBeGreaterThan(0);
    expect(heuristicOnly.hybrid).toBeNull();

    const result = await loadPartnerExportEval({
      samplesDir,
      overrides: null,
      classify: async ({ conversation, customerMessages }) => {
        const gt = conversation.groundTruth;
        if (!gt || gt === "none") {
          return {
            type: "none",
            confidence: 0,
            summary: "",
            quotes: [],
          };
        }
        const quote =
          customerMessages.find((m) => m.content.trim().length >= 8)
            ?.content ?? "";
        return {
          type: gt,
          confidence: 0.7,
          summary: `${conversation.customerName ?? "Customer"} shows ${gt} intent in this thread.`,
          quotes: quote ? [quote.slice(0, 120)] : [],
        };
      },
    });

    expect(result.source).toBe("local");
    expect(result.llm.enabled).toBe(true);
    expect(result.llm.added).toBeGreaterThan(0);
    expect(result.hybrid).not.toBeNull();

    const hybridRecall = result.hybrid!.labeledRecall ?? 0;
    const heuristicRecall = result.heuristic.labeledRecall ?? 0;
    expect(hybridRecall).toBeGreaterThanOrEqual(heuristicRecall);
    expect(hybridRecall).toBeGreaterThan(heuristicRecall);
    expect(result.hybrid!.falsePositives).toBeLessThanOrEqual(
      result.heuristic.falsePositives
    );

    const line = formatPartnerExportHybridLine(
      result.heuristic,
      result.hybrid,
      result.llm
    );
    expect(line).toContain("hybrid vs heuristic:");
    expect(line).toContain("llm attempted=");
  });
});
