import { describe, expect, it } from "vitest";
import {
  consumePartnerDemoNdjson,
  encodePartnerDemoNdjsonLine,
  PARTNER_DEMO_NDJSON_CONTENT_TYPE,
  parsePartnerDemoStreamEvent,
  partnerDemoStatusLabel,
  partnerDemoStepSequence,
  readPartnerDemoNdjsonEvents,
  resetDemoStatusLabel,
  type PartnerDemoCompleteEvent,
  type PartnerDemoStreamEvent,
} from "./partner-demo-progress";

const complete: PartnerDemoCompleteEvent = {
  type: "complete",
  importedConversations: 100,
  newSignals: 14,
  samples: ["Zerodha_batch_02"],
  predictionSync: {
    attempted: 14,
    created: 12,
    updated: 0,
    failed: 2,
    skipped: 0,
  },
  conversationSync: {
    attempted: 100,
    created: 100,
    updated: 0,
    failed: 0,
    skipped: 0,
    messagesCreated: 200,
    messagesUpdated: 0,
  },
  detectLlm: {
    enabled: false,
    candidates: 0,
    attempted: 0,
    added: 0,
    failed: 0,
    skipped: 0,
  },
};

function ndjsonResponse(
  events: PartnerDemoStreamEvent[],
  init?: ResponseInit
): Response {
  return new Response(events.map(encodePartnerDemoNdjsonLine).join(""), {
    status: 200,
    headers: { "Content-Type": PARTNER_DEMO_NDJSON_CONTENT_TYPE },
    ...init,
  });
}

describe("partnerDemoStatusLabel", () => {
  it("names steps without counts", () => {
    expect(
      partnerDemoStatusLabel({ step: "wipe", done: 0, total: 1 })
    ).toBe("Uploading…");
    expect(
      partnerDemoStatusLabel({ step: "detect", done: 12, total: 100 })
    ).toBe("Finding signals…");
    expect(
      partnerDemoStatusLabel({ step: "sync_chats", done: 10, total: 100 })
    ).toBe("Extracting…");
    expect(
      partnerDemoStatusLabel({ step: "sync_signals", done: 4, total: 14 })
    ).toBe("Extracting…");
  });
});

describe("resetDemoStatusLabel", () => {
  it("names wipe as Resetting… and reuses later steps", () => {
    expect(resetDemoStatusLabel({ step: "wipe", done: 0, total: 1 })).toBe(
      "Resetting…"
    );
    expect(
      resetDemoStatusLabel({ step: "detect", done: 12, total: 100 })
    ).toBe("Finding signals…");
  });
});

describe("partnerDemoStepSequence", () => {
  it("collapses ticks into wipe → detect → sync chats → sync signals", () => {
    expect(
      partnerDemoStepSequence([
        { type: "progress", step: "wipe" },
        { type: "progress", step: "wipe" },
        { type: "progress", step: "detect" },
        { type: "progress", step: "detect" },
        { type: "progress", step: "sync_chats" },
        { type: "progress", step: "sync_signals" },
        { type: "complete" },
      ])
    ).toEqual(["wipe", "detect", "sync_chats", "sync_signals"]);
  });
});

describe("parsePartnerDemoStreamEvent", () => {
  it("parses progress, complete (incl. wipeFailed), and error", () => {
    expect(
      parsePartnerDemoStreamEvent({
        type: "progress",
        step: "detect",
        done: 12,
        total: 100,
      })
    ).toEqual({ type: "progress", step: "detect", done: 12, total: 100 });

    expect(
      parsePartnerDemoStreamEvent({
        ...complete,
        wipeFailed: true,
        wipeError: "Signal Score backend unreachable",
      })
    ).toMatchObject({
      type: "complete",
      importedConversations: 100,
      wipeFailed: true,
    });

    expect(
      parsePartnerDemoStreamEvent({ type: "error", error: "Partner demo failed" })
    ).toEqual({ type: "error", error: "Partner demo failed" });
    expect(parsePartnerDemoStreamEvent({ type: "progress", step: "nope" })).toBe(
      null
    );
  });
});

describe("consumePartnerDemoNdjson", () => {
  it("replays progress then returns complete", async () => {
    const events: PartnerDemoStreamEvent[] = [
      { type: "progress", step: "wipe", done: 0, total: 1 },
      { type: "progress", step: "wipe", done: 1, total: 1 },
      { type: "progress", step: "detect", done: 0, total: 100 },
      { type: "progress", step: "detect", done: 100, total: 100 },
      { type: "progress", step: "sync_chats", done: 100, total: 100 },
      { type: "progress", step: "sync_signals", done: 14, total: 14 },
      { ...complete, wipeFailed: true },
    ];
    const labels: string[] = [];
    const result = await consumePartnerDemoNdjson(ndjsonResponse(events), {
      onProgress: (event) => {
        labels.push(partnerDemoStatusLabel(event));
      },
    });

    expect(partnerDemoStepSequence(events)).toEqual([
      "wipe",
      "detect",
      "sync_chats",
      "sync_signals",
    ]);
    expect(labels).toEqual([
      "Uploading…",
      "Uploading…",
      "Finding signals…",
      "Finding signals…",
      "Extracting…",
      "Extracting…",
    ]);
    expect(result.wipeFailed).toBe(true);
    expect(result.predictionSync.failed).toBe(2);
  });

  it("throws the streamed error and JSON fallback errors", async () => {
    await expect(
      consumePartnerDemoNdjson(
        ndjsonResponse([{ type: "error", error: "Partner demo failed" }])
      )
    ).rejects.toThrow("Partner demo failed");

    await expect(
      consumePartnerDemoNdjson(
        new Response(JSON.stringify({ error: "Demo failed" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      )
    ).rejects.toThrow("Demo failed");

    await expect(
      consumePartnerDemoNdjson(
        new Response(null, { status: 500 }),
        { failedMessage: "Reset failed" }
      )
    ).rejects.toThrow("Reset failed");
  });

  it("reads a split NDJSON buffer without dropping the last line", async () => {
    const lines = [
      encodePartnerDemoNdjsonLine({
        type: "progress",
        step: "detect",
        done: 1,
        total: 2,
      }),
      encodePartnerDemoNdjsonLine(complete),
    ].join("");
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const bytes = encoder.encode(lines);
        controller.enqueue(bytes.slice(0, 20));
        controller.enqueue(bytes.slice(20));
        controller.close();
      },
    });
    const events = await readPartnerDemoNdjsonEvents(
      new Response(stream, {
        headers: { "Content-Type": PARTNER_DEMO_NDJSON_CONTENT_TYPE },
      })
    );
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ type: "complete", newSignals: 14 });
  });
});
