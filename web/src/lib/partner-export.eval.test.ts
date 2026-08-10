import { writeFileSync, unlinkSync, existsSync } from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatPartnerExportMetrics,
  loadPartnerExportEval,
  PARTNER_EXPORT_LOCAL_FILE,
  PARTNER_EXPORT_TEMPLATE_FILE,
  resolvePartnerExportPath,
} from "./partner-export-eval";

const SAMPLES_DIR = path.join(process.cwd(), "data/samples");
const LOCAL_PATH = path.join(SAMPLES_DIR, PARTNER_EXPORT_LOCAL_FILE);

afterEach(() => {
  if (existsSync(LOCAL_PATH)) {
    unlinkSync(LOCAL_PATH);
  }
});

describe("real partner export eval lane", () => {
  it("loads the redacted template and reports overall + per-type metrics", () => {
    const result = loadPartnerExportEval({ preferTemplate: true });

    expect(result.source).toBe("template");
    expect(result.filename).toBe(PARTNER_EXPORT_TEMPLATE_FILE);
    expect(result.store.conversations.length).toBeGreaterThanOrEqual(4);
    expect(result.metrics.labeledConversations).toBe(
      result.store.conversations.length
    );

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

    // Template is already redacted — no raw phone/email/PAN shapes.
    const joined = result.store.messages.map((m) => m.content).join(" ");
    expect(joined).toMatch(/\[phone\]|\[email\]|\[pan\]/);
    expect(joined).not.toMatch(/\b\d{10}\b/);
    expect(joined).not.toMatch(/[A-Z]{5}\d{4}[A-Z]/i);
  });

  it("prefers gitignored local drop-in when present", () => {
    writeFileSync(
      LOCAL_PATH,
      [
        "conversation_id,role,content,customer_name,channel,timestamp,ground_truth",
        'local_lead,customer,"Interested in signing up for a new account — email [email]",Local A,whatsapp,2026-08-06T13:00:00.000Z,lead',
        "local_lead,agent,Sharing onboarding.,,whatsapp,2026-08-06T13:01:00.000Z,lead",
        'local_none,customer,"Please reset my password — OTP missing",Local B,in_app_chat,2026-08-06T14:00:00.000Z,none',
        "local_none,agent,Reset sent.,,in_app_chat,2026-08-06T14:01:00.000Z,none",
      ].join("\n"),
      "utf8"
    );

    const resolved = resolvePartnerExportPath(SAMPLES_DIR, false);
    expect(resolved.source).toBe("local");
    expect(resolved.filename).toBe(PARTNER_EXPORT_LOCAL_FILE);

    const result = loadPartnerExportEval({ preferTemplate: false });
    expect(result.source).toBe("local");
    expect(result.metrics.labeledConversations).toBe(2);
    expect(
      result.metrics.byType.find((r) => r.type === "lead")?.labeledCount
    ).toBe(1);
  });
});
