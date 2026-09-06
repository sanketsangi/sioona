import { afterEach, describe, expect, it, vi } from "vitest";
import type { EvalMetrics } from "@/lib/eval";
import type { PartnerExportEvalResult } from "@/lib/partner-export-eval";
import * as partnerExportEval from "@/lib/partner-export-eval";
import { GET } from "./route";

const emptyMetrics: EvalMetrics = {
  labeledConversations: 4,
  predictedSignals: 3,
  reviewedCount: 0,
  correctCount: 0,
  incorrectCount: 0,
  partiallyCorrectCount: 0,
  reviewPrecision: null,
  labeledPrecision: 0.5,
  labeledRecall: 0.4,
  truePositives: 2,
  falsePositives: 1,
  falseNegatives: 1,
  byType: [],
};

function evalResult(
  source: PartnerExportEvalResult["source"]
): PartnerExportEvalResult {
  return {
    source,
    filename:
      source === "week2"
        ? "real-partner-export.week2.local.csv"
        : "real-partner-export.template.csv",
    absolutePath: `/tmp/${source}.csv`,
    store: {} as PartnerExportEvalResult["store"],
    metrics: emptyMetrics,
    heuristic: emptyMetrics,
    adapted: null,
    confusion: [],
    adaptedConfusion: null,
    hybrid: null,
    llm: {
      enabled: false,
      candidates: 0,
      attempted: 0,
      added: 0,
      failed: 0,
      skipped: 0,
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/eval/partner-export", () => {
  it("treats week2=1 / week2=true / source=week2 as preferWeek2", async () => {
    const spy = vi
      .spyOn(partnerExportEval, "loadPartnerExportEval")
      .mockResolvedValue(evalResult("week2"));

    for (const search of ["week2=1", "week2=true", "source=week2"]) {
      spy.mockClear();
      const res = await GET(
        new Request(`http://localhost/api/eval/partner-export?${search}`)
      );
      expect(res.status).toBe(200);
      expect(spy).toHaveBeenCalledWith({
        preferWeek2: true,
        skipHybrid: true,
      });
      const body = (await res.json()) as { source: string; note: string };
      expect(body.source).toBe("week2");
      expect(body.note).toMatch(/w2_rd_/);
      expect(body.note).toMatch(/not SignalScore/);
    }
  });

  it("defaults to week-1/template measurement and never claims go/no-go", async () => {
    vi.spyOn(partnerExportEval, "loadPartnerExportEval").mockResolvedValue(
      evalResult("template")
    );

    const res = await GET(
      new Request("http://localhost/api/eval/partner-export")
    );
    const body = (await res.json()) as { source: string; note: string; ok: boolean };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.source).toBe("template");
    expect(body.note).not.toMatch(/w2_rd_/);
    expect(body.note).toMatch(/not SignalScore \/ go-no-go/);
  });

  it("maps a missing week-2 file to 404 missing_file", async () => {
    vi.spyOn(partnerExportEval, "loadPartnerExportEval").mockRejectedValue(
      new Error(
        "Missing week-2 partner export at /tmp/real-partner-export.week2.local.csv"
      )
    );

    const res = await GET(
      new Request("http://localhost/api/eval/partner-export?week2=1")
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as {
      ok: boolean;
      code: string;
      message: string;
      debugMessage?: string;
    };
    expect(body).toMatchObject({
      ok: false,
      code: "missing_file",
      message: "Week-2 export isn’t ready yet.",
    });
    expect(body.message).not.toMatch(/\/tmp|week2\.local\.csv/);
    if (process.env.NODE_ENV === "development") {
      expect(body.debugMessage).toMatch(/week2\.local\.csv/);
    } else {
      expect(body.debugMessage).toBeUndefined();
    }
  });

  it("maps other loader failures to 500 error with product-safe copy", async () => {
    vi.spyOn(partnerExportEval, "loadPartnerExportEval").mockRejectedValue(
      new Error("CSV parse failed")
    );

    const res = await GET(
      new Request("http://localhost/api/eval/partner-export")
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as {
      ok: boolean;
      code: string;
      message: string;
      debugMessage?: string;
    };
    expect(body).toMatchObject({
      ok: false,
      code: "error",
      message: "Export eval is unavailable right now.",
    });
    expect(body.message).not.toContain("CSV parse failed");
  });
});
