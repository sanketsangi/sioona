import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PARTNER_EXPORT_ADAPT_OVERRIDES } from "../data/fixtures/partner-export-overrides";
import { ZERODHA_BATCH01_ADAPT_OVERRIDES } from "../data/fixtures/zerodha-batch01-overrides";
import {
  DEFAULT_ZERODHA_WEEK4_BATCH02_PATH,
  formatPartnerExportEval,
  formatPartnerExportHybridLine,
  formatPartnerExportMetrics,
  isWeek4Batch02EvalRequested,
  loadPartnerExportEval,
  PARTNER_EXPORT_LOCAL_FILE,
  PARTNER_EXPORT_TEMPLATE_FILE,
  PARTNER_EXPORT_WEEK2_LOCAL_FILE,
  resolvePartnerExportPath,
  resolveWeek4Batch02Path,
  ZERODHA_WEEK4_BATCH02_FILE,
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

  it("prefers week2 drop-in when preferWeek2 and file present", async () => {
    const samplesDir = makeSamplesDir();
    writeFileSync(
      path.join(samplesDir, PARTNER_EXPORT_LOCAL_FILE),
      [
        "conversation_id,role,content,customer_name,channel,timestamp,ground_truth",
        'w1_lead,customer,"Want to open a demat account — email [email]",W1,whatsapp,2026-08-06T13:00:00.000Z,lead',
        "w1_lead,agent,Sharing onboarding.,,whatsapp,2026-08-06T13:01:00.000Z,lead",
      ].join("\n"),
      "utf8"
    );
    writeFileSync(
      path.join(samplesDir, PARTNER_EXPORT_WEEK2_LOCAL_FILE),
      [
        "conversation_id,role,content,customer_name,channel,timestamp,ground_truth",
        'w2_ret,customer,"I may close my account if fees stay this high",W2,whatsapp,2026-08-13T10:00:00.000Z,retention',
        "w2_ret,agent,Looking into it.,,whatsapp,2026-08-13T10:01:00.000Z,retention",
        'w2_none,customer,"Please reset my password — OTP missing",W2b,in_app_chat,2026-08-13T14:00:00.000Z,none',
        "w2_none,agent,Reset sent.,,in_app_chat,2026-08-13T14:01:00.000Z,none",
      ].join("\n"),
      "utf8"
    );

    const defaultResolved = resolvePartnerExportPath(samplesDir, false, false);
    expect(defaultResolved.source).toBe("local");
    expect(defaultResolved.filename).toBe(PARTNER_EXPORT_LOCAL_FILE);

    const week2Resolved = resolvePartnerExportPath(samplesDir, false, true);
    expect(week2Resolved.source).toBe("week2");
    expect(week2Resolved.filename).toBe(PARTNER_EXPORT_WEEK2_LOCAL_FILE);

    const result = await loadPartnerExportEval({
      samplesDir,
      preferWeek2: true,
      overrides: null,
    });
    expect(result.source).toBe("week2");
    expect(result.filename).toBe(PARTNER_EXPORT_WEEK2_LOCAL_FILE);
    expect(result.adapted).toBeNull();
    expect(result.metrics.labeledConversations).toBe(2);
    expect(
      result.metrics.byType.find((r) => r.type === "retention")?.labeledCount
    ).toBe(1);
    expect(formatPartnerExportEval(result)).toContain("source=week2");
  });

  it("throws a clear error when preferWeek2 and week2 file is missing", async () => {
    const samplesDir = makeSamplesDir();
    writeFileSync(
      path.join(samplesDir, PARTNER_EXPORT_LOCAL_FILE),
      [
        "conversation_id,role,content,customer_name,channel,timestamp,ground_truth",
        'w1_lead,customer,"Want to open a demat account — email [email]",W1,whatsapp,2026-08-06T13:00:00.000Z,lead',
        "w1_lead,agent,Sharing onboarding.,,whatsapp,2026-08-06T13:01:00.000Z,lead",
      ].join("\n"),
      "utf8"
    );

    expect(() => resolvePartnerExportPath(samplesDir, false, true)).toThrow(
      PARTNER_EXPORT_WEEK2_LOCAL_FILE
    );
    expect(() => resolvePartnerExportPath(samplesDir, false, true)).toThrow(
      PARTNER_EXPORT_LOCAL_FILE
    );

    await expect(
      loadPartnerExportEval({ samplesDir, preferWeek2: true })
    ).rejects.toThrow(PARTNER_EXPORT_WEEK2_LOCAL_FILE);
  });

  it("applies Adapt overrides by default on week2 local", async () => {
    const samplesDir = makeSamplesDir();
    writeFileSync(
      path.join(samplesDir, PARTNER_EXPORT_WEEK2_LOCAL_FILE),
      [
        "conversation_id,role,content,customer_name,channel,timestamp,ground_truth",
        'upsell_pr,customer,"Portfolio review please. I am already doing SIPs. Yes, send the link. I want to open/start this week.",Ada,whatsapp,2026-08-13T09:00:00.000Z,upsell',
        "upsell_pr,agent,Sharing notes.,,whatsapp,2026-08-13T09:01:00.000Z,upsell",
        'ops_none,customer,"Please reset my password — OTP missing",Dev,in_app_chat,2026-08-13T14:00:00.000Z,none',
        "ops_none,agent,Reset sent.,,in_app_chat,2026-08-13T14:01:00.000Z,none",
      ].join("\n"),
      "utf8"
    );

    const withAdapt = await loadPartnerExportEval({
      samplesDir,
      preferWeek2: true,
    });
    expect(withAdapt.source).toBe("week2");
    expect(withAdapt.adapted).not.toBeNull();
    expect(withAdapt.store.taxonomyOverrides).toEqual(
      PARTNER_EXPORT_ADAPT_OVERRIDES
    );

    const withoutAdapt = await loadPartnerExportEval({
      samplesDir,
      preferWeek2: true,
      overrides: null,
    });
    expect(withoutAdapt.adapted).toBeNull();
  });
});

function writeWeek4Batch02Fixture(filePath: string) {
  writeFileSync(
    filePath,
    JSON.stringify({
      conversations: [
        {
          externalId: "w4_lead",
          channel: "whatsapp",
          customerName: "Ada",
          startedAt: "2026-09-01T06:00:00.000Z",
          messages: [
            {
              role: "customer",
              content:
                "Want to open a demat account this week — send pricing to [email]",
              timestamp: "2026-09-01T06:00:00.000Z",
            },
            {
              role: "agent",
              content: "Sharing the fee schedule.",
              timestamp: "2026-09-01T06:01:00.000Z",
            },
          ],
          labels: [{ signal: "lead", confidence: "high" }],
        },
        {
          externalId: "w4_none",
          channel: "in_app_chat",
          customerName: "Dev",
          startedAt: "2026-09-01T14:00:00.000Z",
          messages: [
            {
              role: "customer",
              content: "Please reset my password — OTP missing",
              timestamp: "2026-09-01T14:00:00.000Z",
            },
            {
              role: "agent",
              content: "Reset sent.",
              timestamp: "2026-09-01T14:01:00.000Z",
            },
          ],
          labels: [{ signal: "complaint" }],
        },
      ],
    }),
    "utf8"
  );
}

describe("week-4 Batch-02 held-out CLI lane", () => {
  it("treats --week4-batch02 and PARTNER_EXPORT=week4-batch02 as the held-out flag", () => {
    expect(isWeek4Batch02EvalRequested(["node", "eval"], {})).toBe(false);
    expect(
      isWeek4Batch02EvalRequested(["node", "eval", "--week4-batch02"], {})
    ).toBe(true);
    expect(
      isWeek4Batch02EvalRequested(["node", "eval", "--week4batch02"], {})
    ).toBe(true);
    expect(
      isWeek4Batch02EvalRequested(["node", "eval"], {
        PARTNER_EXPORT: "week4-batch02",
      })
    ).toBe(true);
    expect(
      isWeek4Batch02EvalRequested(["node", "eval"], {
        PARTNER_EXPORT: "week4batch02",
      })
    ).toBe(true);
    expect(
      isWeek4Batch02EvalRequested(["node", "eval", "--week2"], {
        PARTNER_EXPORT: "week2",
      })
    ).toBe(false);
  });

  it("throws a clear error when the held-out JSON is missing", () => {
    const missing = path.join(
      os.tmpdir(),
      `missing-week4-batch02-${Date.now()}.json`
    );
    expect(() => resolveWeek4Batch02Path(missing)).toThrow(missing);
    expect(() => resolveWeek4Batch02Path(missing)).toThrow("web/data/samples");
    expect(() => resolveWeek4Batch02Path(missing)).toThrow("ingest");
  });

  it("does not fall back to week-1 samples or copy into data/samples", async () => {
    const samplesDir = makeSamplesDir();
    writeFileSync(
      path.join(samplesDir, PARTNER_EXPORT_LOCAL_FILE),
      [
        "conversation_id,role,content,customer_name,channel,timestamp,ground_truth",
        'w1_lead,customer,"Want to open a demat account — email [email]",W1,whatsapp,2026-08-06T13:00:00.000Z,lead',
        "w1_lead,agent,Sharing onboarding.,,whatsapp,2026-08-06T13:01:00.000Z,lead",
      ].join("\n"),
      "utf8"
    );
    writeFileSync(
      path.join(samplesDir, ZERODHA_WEEK4_BATCH02_FILE),
      JSON.stringify({ conversations: [] }),
      "utf8"
    );

    const packDir = makeSamplesDir();
    const packPath = path.join(packDir, ZERODHA_WEEK4_BATCH02_FILE);
    writeWeek4Batch02Fixture(packPath);

    const resolved = resolveWeek4Batch02Path(packPath);
    expect(resolved.source).toBe("week4batch02");
    expect(resolved.filename).toBe(ZERODHA_WEEK4_BATCH02_FILE);
    expect(resolved.absolutePath).toBe(packPath);
    expect(resolved.absolutePath).not.toContain(`${path.sep}data${path.sep}samples${path.sep}`);

    const result = await loadPartnerExportEval({
      samplesDir,
      preferWeek4Batch02: true,
      week4Batch02Path: packPath,
    });
    expect(result.source).toBe("week4batch02");
    expect(result.absolutePath).toBe(packPath);
    expect(result.metrics.labeledConversations).toBe(2);
    expect(
      result.metrics.byType.find((r) => r.type === "lead")?.labeledCount
    ).toBe(1);
    expect(result.store.taxonomyOverrides).toEqual(
      ZERODHA_BATCH01_ADAPT_OVERRIDES
    );
    expect(result.adapted).not.toBeNull();
    expect(formatPartnerExportEval(result)).toContain("source=week4batch02");
    expect(formatPartnerExportEval(result)).toContain(
      "note=held-out CLI, not keep-set"
    );
  });

  it("skips Zerodha Adapt when overrides are null", async () => {
    const packDir = makeSamplesDir();
    const packPath = path.join(packDir, ZERODHA_WEEK4_BATCH02_FILE);
    writeWeek4Batch02Fixture(packPath);

    const result = await loadPartnerExportEval({
      preferWeek4Batch02: true,
      week4Batch02Path: packPath,
      overrides: null,
    });
    expect(result.source).toBe("week4batch02");
    expect(result.adapted).toBeNull();
  });
});

const WEEK4_BATCH02_PACK_PRESENT = existsSync(DEFAULT_ZERODHA_WEEK4_BATCH02_PATH);

describe.skipIf(!WEEK4_BATCH02_PACK_PRESENT)(
  "Zerodha Week-4 Batch-02 pack (local Synthetic-Data, held-out CLI)",
  () => {
    it("scores labeled P/R in place without using data/samples", async () => {
      const result = await loadPartnerExportEval({
        preferWeek4Batch02: true,
        skipHybrid: true,
      });
      expect(result.source).toBe("week4batch02");
      expect(result.filename).toBe(ZERODHA_WEEK4_BATCH02_FILE);
      expect(result.absolutePath).toBe(DEFAULT_ZERODHA_WEEK4_BATCH02_PATH);
      expect(result.absolutePath).not.toContain(
        `${path.sep}web${path.sep}data${path.sep}samples`
      );
      expect(result.metrics.labeledConversations).toBe(100);
      expect(
        result.metrics.byType.find((r) => r.type === "lead")?.labeledCount
      ).toBe(15);
      expect(
        result.metrics.byType.find((r) => r.type === "upsell")?.labeledCount
      ).toBe(12);
      expect(
        result.metrics.byType.find((r) => r.type === "retention")?.labeledCount
      ).toBe(28);
      expect(typeof result.metrics.labeledPrecision).toBe("number");
      expect(typeof result.metrics.labeledRecall).toBe("number");
      expect(result.adapted).not.toBeNull();
      expect(formatPartnerExportEval(result)).toContain(
        "note=held-out CLI, not keep-set"
      );
    });
  }
);
