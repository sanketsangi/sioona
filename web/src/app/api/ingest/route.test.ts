import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/defer-ingest-sync", () => ({
  persistDeferredIngestDualWrite: vi.fn().mockResolvedValue(undefined),
}));

import { signalsForPublishedConversations } from "./publication";
import { POST } from "./route";
import { persistDeferredIngestDualWrite } from "@/lib/defer-ingest-sync";
import { runDetection } from "@/lib/detect";
import * as detectLlm from "@/lib/detect-llm";
import * as backendClient from "@/lib/backend-client";
import { BackendClientError } from "@/lib/backend-client";
import {
  readStore,
  resetStore,
  setSignalActed,
  setSignalFeedback,
  writeStore,
} from "@/lib/store";
import { EXPECTED_TESTING_JSON, ZERODHA_BATCH02_SAMPLE_NAME } from "@/lib/testing-json-eval";
import {
  CONFIRM_PARTNER_DEMO_REPLACE_FIELD,
  PARTNER_DEMO_REPLACE_CONFIRM_CODE,
  PARTNER_DEMO_REPLACE_CONFIRM_MESSAGE,
} from "@/lib/partner-demo-replace-guard";
import {
  CONFIRM_HELD_OUT_WEEKLY_INGEST_FIELD,
  HELD_OUT_WEEKLY_INGEST_CONFIRM_CODE,
  HELD_OUT_WEEKLY_INGEST_CONFIRM_MESSAGE,
  WEEK4_BATCH02_HELD_OUT_BASENAME,
} from "@/lib/partner-weekly-pack";

const LEAD_LINE =
  'wa-reupload-1,customer,"Hi, I want to open a demat account this week",Asha,whatsapp,lead';
const LEAD_LINE_UPDATED =
  'wa-reupload-1,customer,"Hi, I want to open a demat account today please",Asha,whatsapp,lead';
const NEW_CONV_LINE =
  'wa-reupload-2,customer,"Hi, I want to open a demat account this week",Neha,whatsapp,lead';

const WEEKLY_JSON_CONV = {
  externalId: "wa-reupload-1",
  channel: "whatsapp",
  customerName: "Asha",
  startedAt: "2026-08-25T08:00:00.000Z",
  messages: [
    {
      role: "customer",
      content: "Hi, I want to open a demat account today please",
      timestamp: "2026-08-25T08:00:00.000Z",
    },
  ],
};

function csvFile(name: string, rows: string[]) {
  const csv = [
    "conversation_id,role,content,customer_name,channel,ground_truth",
    ...rows,
  ].join("\n");
  return new File([csv], name, { type: "text/csv" });
}

function jsonFile(name: string, conversations: object[]) {
  return new File([JSON.stringify({ conversations })], name, {
    type: "application/json",
  });
}

function ingestRequest(
  file: File | File[],
  options?: {
    replace?: boolean;
    confirmPartnerDemoReplace?: boolean;
    confirmHeldOutWeeklyIngest?: boolean;
  }
) {
  const body = new FormData();
  for (const item of Array.isArray(file) ? file : [file]) {
    body.append("file", item);
  }
  if (options?.replace) body.append("replace", "true");
  if (options?.confirmPartnerDemoReplace) {
    body.append(CONFIRM_PARTNER_DEMO_REPLACE_FIELD, "true");
  }
  if (options?.confirmHeldOutWeeklyIngest) {
    body.append(CONFIRM_HELD_OUT_WEEKLY_INGEST_FIELD, "true");
  }
  return new Request("http://localhost/api/ingest", {
    method: "POST",
    body,
  });
}

describe("POST /api/ingest", () => {
  it("drops signals for conversation identities removed by an external-id replacement", () => {
    const kept = { conversationId: "replacement", type: "lead" };
    const removed = { conversationId: "removed", type: "retention" };

    expect(
      signalsForPublishedConversations([removed, kept], [{ id: "replacement" }])
    ).toEqual([kept]);
  });

  beforeEach(async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("backend unavailable in tests"))
    );
    vi.mocked(persistDeferredIngestDualWrite)
      .mockReset()
      .mockResolvedValue(undefined);
    await resetStore();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("replaces showcase chats on the first partner upload after reset", async () => {
    const before = await readStore();
    expect(before.conversations).toHaveLength(EXPECTED_TESTING_JSON.conversations);
    const showcaseIds = new Set(before.conversations.map((row) => row.id));
    before.pilot = {
      baselineOpportunities: 12,
      baselineNote: "partner agreed",
      weeklyExportCount: 0,
    };
    before.taxonomyOverrides = { lead: { phrases: ["demat account"] } };
    await writeStore(before);

    const first = await POST(
      ingestRequest(csvFile("real-partner-export.local.csv", [LEAD_LINE]))
    );
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as {
      importedConversations: number;
      replaced?: boolean;
      conversationPrune?: { skipped: boolean };
      predictionSync?: { attempted: number; failed: number };
    };
    expect(firstBody.importedConversations).toBe(1);
    expect(firstBody.replaced).toBe(true);
    expect(firstBody.conversationPrune).toBeUndefined();
    expect(firstBody.predictionSync?.attempted).toBe(0);

    const afterFirst = await readStore();
    expect(afterFirst.conversations).toHaveLength(1);
    expect(
      afterFirst.conversations.every((conversation) => !showcaseIds.has(conversation.id))
    ).toBe(true);
    expect(afterFirst.conversations[0].externalId).toBe("wa-reupload-1");
    expect(afterFirst.pilot?.weeklyExportCount).toBe(1);
    expect(afterFirst.pilot?.lastUploadedFileName).toBe(
      "real-partner-export.local.csv"
    );
    expect(afterFirst.pilot?.baselineOpportunities).toBe(12);
    expect(afterFirst.pilot?.baselineNote).toBe("partner agreed");
    expect(afterFirst.taxonomyOverrides?.lead?.phrases).toEqual(["demat account"]);
    expect(
      afterFirst.messages.some(
        (message) =>
          message.conversationId === afterFirst.conversations[0].id &&
          message.content.includes("this week")
      )
    ).toBe(true);
  });

  it("does not apply sample Adapt packs on a real partner upload", async () => {
    const before = await readStore();
    before.pilot = {
      baselineOpportunities: 0,
      weeklyExportCount: 0,
    };
    before.taxonomyOverrides = { lead: { phrases: ["demat account"] } };
    await writeStore(before);

    const first = await POST(
      ingestRequest(
        csvFile("real-partner-export.local.csv", [
          'upsell_pr,customer,"Portfolio review please. I am already doing SIPs. Yes, send the link. I want to open/start this week.",Ada,whatsapp,upsell',
        ])
      )
    );
    expect(first.status).toBe(200);

    const after = await readStore();
    expect(after.taxonomyOverrides?.lead?.phrases).toEqual(["demat account"]);
    expect(after.taxonomyOverrides?.lead?.negativePhrases).toBeUndefined();
    expect(after.taxonomyOverrides?.upsell?.phrases).toBeUndefined();

    const conversation = after.conversations.find(
      (row) => row.externalId === "upsell_pr"
    );
    expect(conversation).toBeTruthy();
    const messages = after.messages.filter(
      (message) => message.conversationId === conversation!.id
    );

    const baseSignals = runDetection(
      [conversation!],
      messages,
      after.tenant.id
    );
    expect(baseSignals.some((signal) => signal.type === "lead")).toBe(true);
    expect(baseSignals.some((signal) => signal.type === "upsell")).toBe(false);

    const adapted = after.signals.filter(
      (signal) => signal.conversationId === conversation!.id
    );
    expect(adapted.some((signal) => signal.type === "lead")).toBe(true);
    expect(adapted.some((signal) => signal.type === "upsell")).toBe(false);
  });

  it("upserts the same conversation_id instead of appending a duplicate", async () => {
    const first = await POST(
      ingestRequest(csvFile("real-partner-export.local.csv", [LEAD_LINE]))
    );
    expect(first.status).toBe(200);

    const afterFirst = await readStore();
    expect(afterFirst.conversations).toHaveLength(1);
    const uploaded = afterFirst.conversations.filter(
      (conversation) => conversation.externalId === "wa-reupload-1"
    );
    expect(uploaded).toHaveLength(1);
    const conversationId = uploaded[0].id;
    expect(
      afterFirst.messages.some(
        (message) =>
          message.conversationId === conversationId &&
          message.content.includes("this week")
      )
    ).toBe(true);

    const second = await POST(
      ingestRequest(
        csvFile("real-partner-export.week2.local.csv", [LEAD_LINE_UPDATED])
      )
    );
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { replaced?: boolean };
    expect(secondBody.replaced).toBe(false);

    const afterSecond = await readStore();
    expect(afterSecond.conversations).toHaveLength(1);
    expect(
      afterSecond.conversations.filter(
        (conversation) => conversation.externalId === "wa-reupload-1"
      )
    ).toHaveLength(1);
    expect(
      afterSecond.conversations.find(
        (conversation) => conversation.externalId === "wa-reupload-1"
      )?.id
    ).toBe(conversationId);
    const updatedMessages = afterSecond.messages.filter(
      (message) => message.conversationId === conversationId
    );
    expect(updatedMessages.some((message) => message.content.includes("today please"))).toBe(
      true
    );
    expect(
      updatedMessages.some((message) => message.content.includes("this week"))
    ).toBe(false);
    expect(afterSecond.pilot?.weeklyExportCount).toBe(2);
    expect(afterSecond.pilot?.lastUploadedFileName).toBe(
      "real-partner-export.week2.local.csv"
    );
  });

  it("mid-week upserts week3 partner pack and bumps weeklyExportCount", async () => {
    const first = await POST(
      ingestRequest(csvFile("real-partner-export.local.csv", [LEAD_LINE]))
    );
    expect(first.status).toBe(200);
    expect((await readStore()).pilot?.weeklyExportCount).toBe(1);

    const second = await POST(
      ingestRequest(
        csvFile("real-partner-export.week3.local.csv", [LEAD_LINE_UPDATED])
      )
    );
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { replaced?: boolean };
    expect(secondBody.replaced).toBe(false);

    const after = await readStore();
    expect(after.pilot?.weeklyExportCount).toBe(2);
    expect(after.pilot?.lastUploadedFileName).toBe(
      "real-partner-export.week3.local.csv"
    );
    const conversationId = after.conversations.find(
      (conversation) => conversation.externalId === "wa-reupload-1"
    )?.id;
    expect(conversationId).toBeTruthy();
    expect(
      after.messages.some(
        (message) =>
          message.conversationId === conversationId &&
          message.content.includes("today please")
      )
    ).toBe(true);
  });

  it("mid-week upserts week4 CSV partner pack and bumps weeklyExportCount", async () => {
    const first = await POST(
      ingestRequest(csvFile("real-partner-export.local.csv", [LEAD_LINE]))
    );
    expect(first.status).toBe(200);
    expect((await readStore()).pilot?.weeklyExportCount).toBe(1);

    const second = await POST(
      ingestRequest(
        csvFile("real-partner-export.week4.local.csv", [LEAD_LINE_UPDATED])
      )
    );
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { replaced?: boolean };
    expect(secondBody.replaced).toBe(false);

    const after = await readStore();
    expect(after.pilot?.weeklyExportCount).toBe(2);
    expect(after.pilot?.lastUploadedFileName).toBe(
      "real-partner-export.week4.local.csv"
    );
    const conversationId = after.conversations.find(
      (conversation) => conversation.externalId === "wa-reupload-1"
    )?.id;
    expect(conversationId).toBeTruthy();
    expect(
      after.messages.some(
        (message) =>
          message.conversationId === conversationId &&
          message.content.includes("today please")
      )
    ).toBe(true);
  });

  it("mid-week upserts week4 partner pack and bumps weeklyExportCount", async () => {
    const first = await POST(
      ingestRequest(csvFile("real-partner-export.local.csv", [LEAD_LINE]))
    );
    expect(first.status).toBe(200);
    expect((await readStore()).pilot?.weeklyExportCount).toBe(1);

    const second = await POST(
      ingestRequest(
        jsonFile("Zerodha_week_4_batch_01.json", [
          {
            externalId: "wa-reupload-1",
            channel: "whatsapp",
            customerName: "Asha",
            startedAt: "2026-08-25T08:00:00.000Z",
            messages: [
              {
                role: "customer",
                content: "Hi, I want to open a demat account today please",
                timestamp: "2026-08-25T08:00:00.000Z",
              },
              {
                role: "agent",
                content: "Kite → signup.zerodha.com. KYC needs PAN + Aadhaar OTP.",
                timestamp: "2026-08-25T08:02:00.000Z",
              },
            ],
            labels: [
              {
                signal: "lead",
                confidence: "high",
                reason: "New demat open request",
              },
            ],
          },
        ])
      )
    );
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { replaced?: boolean };
    expect(secondBody.replaced).toBe(false);

    const after = await readStore();
    expect(after.pilot?.weeklyExportCount).toBe(2);
    expect(after.pilot?.lastUploadedFileName).toBe(
      "Zerodha_week_4_batch_01.json"
    );
    const conversationId = after.conversations.find(
      (conversation) => conversation.externalId === "wa-reupload-1"
    )?.id;
    expect(conversationId).toBeTruthy();
    expect(
      after.messages.some(
        (message) =>
          message.conversationId === conversationId &&
          message.content.includes("today please")
      )
    ).toBe(true);
  });

  it("overlays Neon weeklyExportCount so week4 upserts when local count is 0", async () => {
    const before = await readStore();
    const priorCount = before.conversations.length;
    expect(priorCount).toBeGreaterThan(1);
    before.pilot = {
      baselineOpportunities: 0,
      updatedAt: new Date().toISOString(),
    };
    await writeStore(before);

    vi.spyOn(backendClient, "getPilotSettings").mockResolvedValue({
      id: "pilot-uuid-heal",
      tenant_id: "tenant_demo",
      baseline_opportunities: 12,
      baseline_note: null,
      weekly_export_count: 5,
      last_uploaded_file_name: "Groww_batch_02",
      created_at: "2026-08-24T12:18:03.000Z",
      updated_at: "2026-08-24T12:18:03.000Z",
    });

    const response = await POST(
      ingestRequest(
        jsonFile("Zerodha_week_4_batch_01.json", [
          {
            externalId: "wa-reupload-1",
            channel: "whatsapp",
            customerName: "Asha",
            startedAt: "2026-08-25T08:00:00.000Z",
            messages: [
              {
                role: "customer",
                content: "Hi, I want to open a demat account today please",
                timestamp: "2026-08-25T08:00:00.000Z",
              },
            ],
          },
        ])
      )
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { replaced?: boolean };
    expect(body.replaced).toBe(false);

    const after = await readStore();
    expect(after.conversations.length).toBe(priorCount + 1);
    expect(after.pilot?.weeklyExportCount).toBe(6);
    expect(after.pilot?.baselineOpportunities).toBe(12);
    expect(after.pilot?.lastUploadedFileName).toBe(
      "Zerodha_week_4_batch_01.json"
    );
  });

  it("overlays Neon weeklyExportCount so week5-style basename upserts when local count is 0", async () => {
    const before = await readStore();
    const priorCount = before.conversations.length;
    expect(priorCount).toBeGreaterThan(1);
    before.pilot = {
      baselineOpportunities: 0,
      updatedAt: new Date().toISOString(),
    };
    await writeStore(before);

    vi.spyOn(backendClient, "getPilotSettings").mockResolvedValue({
      id: "pilot-uuid-week5",
      tenant_id: "tenant_demo",
      baseline_opportunities: 12,
      baseline_note: null,
      weekly_export_count: 5,
      last_uploaded_file_name: "Zerodha_week_4_batch_01.json",
      created_at: "2026-08-31T09:58:00.000Z",
      updated_at: "2026-08-31T09:58:00.000Z",
    });

    const response = await POST(
      ingestRequest(jsonFile("Zerodha_week_5_batch_01.json", [WEEKLY_JSON_CONV]))
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { replaced?: boolean };
    expect(body.replaced).toBe(false);

    const after = await readStore();
    expect(after.conversations.length).toBe(priorCount + 1);
    expect(after.pilot?.weeklyExportCount).toBe(6);
    expect(after.pilot?.baselineOpportunities).toBe(12);
    expect(after.pilot?.lastUploadedFileName).toBe(
      "Zerodha_week_5_batch_01.json"
    );
  });

  it("overlays Neon weeklyExportCount so week5 CSV upserts when local count is 0", async () => {
    const before = await readStore();
    const priorCount = before.conversations.length;
    before.pilot = {
      baselineOpportunities: 0,
      updatedAt: new Date().toISOString(),
    };
    await writeStore(before);

    vi.spyOn(backendClient, "getPilotSettings").mockResolvedValue({
      id: "pilot-uuid-week5-csv",
      tenant_id: "tenant_demo",
      baseline_opportunities: 12,
      baseline_note: null,
      weekly_export_count: 5,
      last_uploaded_file_name: "Zerodha_week_4_batch_01.json",
      created_at: "2026-08-31T09:58:00.000Z",
      updated_at: "2026-08-31T09:58:00.000Z",
    });

    const response = await POST(
      ingestRequest(
        csvFile("real-partner-export.week5.local.csv", [LEAD_LINE_UPDATED])
      )
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { replaced?: boolean };
    expect(body.replaced).toBe(false);

    const after = await readStore();
    expect(after.conversations.length).toBe(priorCount + 1);
    expect(after.pilot?.weeklyExportCount).toBe(6);
    expect(after.pilot?.lastUploadedFileName).toBe(
      "real-partner-export.week5.local.csv"
    );
  });

  it("unknown-name upload keeps chats when Neon says a real file is loaded", async () => {
    const before = await readStore();
    const priorIds = new Set(before.conversations.map((row) => row.id));
    before.pilot = {
      baselineOpportunities: 0,
      updatedAt: new Date().toISOString(),
    };
    await writeStore(before);

    vi.spyOn(backendClient, "getPilotSettings").mockResolvedValue({
      id: "pilot-uuid-unknown",
      tenant_id: "tenant_demo",
      baseline_opportunities: 12,
      baseline_note: null,
      weekly_export_count: 6,
      last_uploaded_file_name: "Zerodha_week_4_batch_01.json",
      created_at: "2026-08-31T09:58:00.000Z",
      updated_at: "2026-08-31T09:58:00.000Z",
    });

    const response = await POST(
      ingestRequest(csvFile("user-upload.csv", [NEW_CONV_LINE]))
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { replaced?: boolean };
    expect(body.replaced).toBe(false);

    const after = await readStore();
    expect(after.conversations).toHaveLength(priorIds.size + 1);
    expect(
      after.conversations.some(
        (row) =>
          row.externalId === "wa-reupload-2" &&
          row.sourceFile === "user-upload.csv",
      ),
    ).toBe(true);
    expect(
      [...priorIds].every((id) => after.conversations.some((row) => row.id === id)),
    ).toBe(true);
    expect(after.pilot?.weeklyExportCount).toBe(6);
    expect(after.pilot?.lastUploadedFileName).toBe("user-upload.csv");
  });

  it("returns 409 when Week-4 Batch-02 is uploaded without confirm", async () => {
    const before = await readStore();
    const priorCount = before.conversations.length;
    before.pilot = {
      baselineOpportunities: 12,
      weeklyExportCount: 6,
      updatedAt: new Date().toISOString(),
      lastUploadedFileName: "Zerodha_week_4_batch_01.json",
    };
    await writeStore(before);

    const blocked = await POST(
      ingestRequest(jsonFile(WEEK4_BATCH02_HELD_OUT_BASENAME, [WEEKLY_JSON_CONV]))
    );
    expect(blocked.status).toBe(409);
    await expect(blocked.json()).resolves.toEqual({
      error: HELD_OUT_WEEKLY_INGEST_CONFIRM_MESSAGE,
      code: HELD_OUT_WEEKLY_INGEST_CONFIRM_CODE,
    });

    const afterBlocked = await readStore();
    expect(afterBlocked.conversations).toHaveLength(priorCount);
    expect(afterBlocked.pilot?.lastUploadedFileName).toBe(
      "Zerodha_week_4_batch_01.json"
    );
    expect(afterBlocked.pilot?.weeklyExportCount).toBe(6);
  });

  it("upserts Week-4 Batch-02 when confirm_held_out_weekly_ingest is set", async () => {
    const before = await readStore();
    const priorCount = before.conversations.length;
    before.pilot = {
      baselineOpportunities: 12,
      weeklyExportCount: 6,
      updatedAt: new Date().toISOString(),
      lastUploadedFileName: "Zerodha_week_4_batch_01.json",
    };
    await writeStore(before);

    const confirmed = await POST(
      ingestRequest(
        jsonFile(WEEK4_BATCH02_HELD_OUT_BASENAME, [WEEKLY_JSON_CONV]),
        { confirmHeldOutWeeklyIngest: true }
      )
    );
    expect(confirmed.status).toBe(200);
    const body = (await confirmed.json()) as { replaced?: boolean };
    expect(body.replaced).toBe(false);

    const after = await readStore();
    expect(after.conversations.length).toBe(priorCount + 1);
    expect(after.pilot?.weeklyExportCount).toBe(7);
    expect(after.pilot?.lastUploadedFileName).toBe(
      WEEK4_BATCH02_HELD_OUT_BASENAME
    );
  });

  it("keeps SignalScore feedback and Acted across re-upload", async () => {
    const first = await POST(
      ingestRequest(csvFile("real-partner-export.local.csv", [LEAD_LINE]))
    );
    expect(first.status).toBe(200);

    const afterFirst = await readStore();
    const uploaded = afterFirst.conversations.find(
      (conversation) => conversation.externalId === "wa-reupload-1"
    );
    expect(uploaded).toBeTruthy();
    const signal = afterFirst.signals.find(
      (row) => row.conversationId === uploaded!.id && row.type === "lead"
    );
    expect(signal).toBeTruthy();

    await setSignalFeedback(signal!.id, "correct", "clear intent");
    const acted = await setSignalActed(signal!.id, true);
    expect(acted.ok).toBe(true);

    const second = await POST(
      ingestRequest(
        csvFile("real-partner-export.week2.local.csv", [LEAD_LINE_UPDATED])
      )
    );
    expect(second.status).toBe(200);

    const afterSecond = await readStore();
    const kept = afterSecond.signals.find(
      (row) => row.conversationId === uploaded!.id && row.type === "lead"
    );
    expect(kept?.feedback?.label).toBe("correct");
    expect(kept?.feedback?.note).toBe("clear intent");
    expect(kept?.status).toBe("acted");
    expect(kept?.id).toBe(signal!.id);
  });

  it("appends a new externalId and still increments weeklyExportCount", async () => {
    const first = await POST(
      ingestRequest(csvFile("real-partner-export.local.csv", [LEAD_LINE]))
    );
    expect(first.status).toBe(200);
    expect((await readStore()).pilot?.weeklyExportCount).toBe(1);

    const second = await POST(
      ingestRequest(csvFile("real-partner-export.week2.local.csv", [NEW_CONV_LINE]))
    );
    expect(second.status).toBe(200);

    const after = await readStore();
    expect(after.pilot?.weeklyExportCount).toBe(2);
    expect(after.conversations).toHaveLength(2);
    expect(
      after.conversations.filter(
        (conversation) => conversation.externalId === "wa-reupload-1"
      )
    ).toHaveLength(1);
    expect(
      after.conversations.filter(
        (conversation) => conversation.externalId === "wa-reupload-2"
      )
    ).toHaveLength(1);
  });

  it("does not delete unmatched chats on the merge path", async () => {
    const first = await POST(
      ingestRequest(
        csvFile("real-partner-export.local.csv", [LEAD_LINE, NEW_CONV_LINE])
      )
    );
    expect(first.status).toBe(200);
    expect((await readStore()).conversations).toHaveLength(2);

    const second = await POST(
      ingestRequest(
        csvFile("real-partner-export.week2.local.csv", [LEAD_LINE_UPDATED])
      )
    );
    expect(second.status).toBe(200);

    const after = await readStore();
    expect(after.conversations).toHaveLength(2);
    expect(
      after.conversations.map((conversation) => conversation.externalId).sort()
    ).toEqual(["wa-reupload-1", "wa-reupload-2"]);
  });

  it("explicit replace=true drops chats not in the file after a prior export", async () => {
    const first = await POST(
      ingestRequest(
        csvFile("real-partner-export.local.csv", [LEAD_LINE, NEW_CONV_LINE])
      )
    );
    expect(first.status).toBe(200);
    expect((await readStore()).pilot?.weeklyExportCount).toBe(1);

    const second = await POST(
      ingestRequest(
        csvFile("real-partner-export.week2.local.csv", [LEAD_LINE_UPDATED]),
        { replace: true }
      )
    );
    expect(second.status).toBe(200);
    const body = (await second.json()) as { replaced?: boolean };
    expect(body.replaced).toBe(true);

    const after = await readStore();
    expect(after.conversations).toHaveLength(1);
    expect(after.conversations[0].externalId).toBe("wa-reupload-1");
    expect(after.pilot?.weeklyExportCount).toBe(2);
  });

  it("non-partner uploads keep earlier uploaded files", async () => {
    const partnerFirst = await POST(
      ingestRequest(csvFile("real-partner-export.local.csv", [LEAD_LINE]))
    );
    expect(partnerFirst.status).toBe(200);

    const afterPartner = await readStore();
    expect(afterPartner.conversations).toHaveLength(1);
    expect(afterPartner.pilot?.weeklyExportCount).toBe(1);

    const nonPartnerFirst = await POST(
      ingestRequest(csvFile("user-upload.csv", [NEW_CONV_LINE]))
    );
    expect(nonPartnerFirst.status).toBe(200);

    const nonPartnerFirstBody = (await nonPartnerFirst.json()) as {
      replaced?: boolean;
    };
    expect(nonPartnerFirstBody.replaced).toBe(false);

    const afterNonPartnerFirst = await readStore();
    expect(afterNonPartnerFirst.conversations).toHaveLength(2);
    expect(
      afterNonPartnerFirst.conversations.map((row) => row.sourceFile).sort(),
    ).toEqual(["real-partner-export.local.csv", "user-upload.csv"]);
    expect(afterNonPartnerFirst.pilot?.weeklyExportCount).toBe(1);
    expect(afterNonPartnerFirst.pilot?.lastUploadedFileName).toBe(
      "user-upload.csv",
    );

    const nonPartnerSecond = await POST(
      ingestRequest(csvFile("user-upload-2.csv", [LEAD_LINE_UPDATED]))
    );
    expect(nonPartnerSecond.status).toBe(200);

    const nonPartnerSecondBody = (await nonPartnerSecond.json()) as {
      replaced?: boolean;
    };
    expect(nonPartnerSecondBody.replaced).toBe(false);

    const afterNonPartnerSecond = await readStore();
    // LEAD_LINE_UPDATED matches wa-reupload-1 and moves that chat onto the new file.
    expect(
      afterNonPartnerSecond.conversations.map((row) => row.sourceFile).sort(),
    ).toEqual(["user-upload-2.csv", "user-upload.csv"]);
    expect(afterNonPartnerSecond.pilot?.weeklyExportCount).toBe(1);
    expect(afterNonPartnerSecond.pilot?.lastUploadedFileName).toBe(
      "user-upload-2.csv",
    );
  });

  it("former eval pack CSVs stay beside earlier uploaded chats", async () => {
    const partnerFirst = await POST(
      ingestRequest(csvFile("real-partner-export.local.csv", [LEAD_LINE]))
    );
    expect(partnerFirst.status).toBe(200);
    expect((await readStore()).pilot?.weeklyExportCount).toBe(1);

    const dropped = await POST(
      ingestRequest(csvFile("partner-shaped-labeled.csv", [NEW_CONV_LINE]))
    );
    expect(dropped.status).toBe(200);
    const droppedBody = (await dropped.json()) as { replaced?: boolean };
    expect(droppedBody.replaced).toBe(false);

    const after = await readStore();
    expect(after.conversations).toHaveLength(2);
    expect(after.conversations.map((row) => row.sourceFile).sort()).toEqual([
      "partner-shaped-labeled.csv",
      "real-partner-export.local.csv",
    ]);
    expect(after.pilot?.weeklyExportCount).toBe(1);
    expect(after.pilot?.lastUploadedFileName).toBe(
      "partner-shaped-labeled.csv",
    );
  });

  it("lists a second upload separately when the file name is already used", async () => {
    const first = await POST(
      ingestRequest(jsonFile("batch_095.json", [WEEKLY_JSON_CONV])),
    );
    expect(first.status).toBe(200);

    const second = await POST(
      ingestRequest(
        jsonFile("batch_095.json", [
          { ...WEEKLY_JSON_CONV, externalId: "wa-reupload-2", customerName: "Neha" },
        ]),
      ),
    );
    expect(second.status).toBe(200);
    const body = (await second.json()) as {
      replaced?: boolean;
      catalogFiles?: string[];
    };
    expect(body.replaced).toBe(false);
    expect(body.catalogFiles).toEqual(["batch_095 (2).json"]);

    const after = await readStore();
    expect(after.conversations.map((row) => row.sourceFile).sort()).toEqual([
      "batch_095 (2).json",
      "batch_095.json",
    ]);
    expect(after.pilot?.lastUploadedFileName).toBe("batch_095 (2).json");
  });

  it("keeps the first file's chats when a same-name upload repeats an externalId", async () => {
    const first = await POST(
      ingestRequest(jsonFile("batch_095.json", [WEEKLY_JSON_CONV])),
    );
    expect(first.status).toBe(200);

    const second = await POST(
      ingestRequest(
        jsonFile("batch_095.json", [
          {
            ...WEEKLY_JSON_CONV,
            messages: [
              {
                ...WEEKLY_JSON_CONV.messages[0],
                content: "Hi, I want to open a demat account this week",
              },
            ],
          },
        ]),
      ),
    );
    expect(second.status).toBe(200);

    const after = await readStore();
    expect(after.conversations).toHaveLength(2);
    const original = after.conversations.find(
      (row) => row.sourceFile === "batch_095.json",
    );
    const copy = after.conversations.find(
      (row) => row.sourceFile === "batch_095 (2).json",
    );
    expect(original?.externalId).toBe("wa-reupload-1");
    expect(copy?.externalId).toBe("wa-reupload-1");
    expect(original?.id).not.toBe(copy?.id);
    const originalMessage = after.messages.find(
      (row) => row.conversationId === original?.id,
    );
    expect(originalMessage?.content).toContain("today please");
  });

  it("suffixes duplicate names inside one upload", async () => {
    const seeded = await POST(ingestRequest(csvFile("already.csv", [LEAD_LINE])));
    expect(seeded.status).toBe(200);

    const response = await POST(
      ingestRequest([
        jsonFile("batch_095.json", [
          { ...WEEKLY_JSON_CONV, externalId: "wa-reupload-2", customerName: "Neha" },
        ]),
        jsonFile("batch_095.json", [WEEKLY_JSON_CONV]),
      ]),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { catalogFiles?: string[] };
    expect(body.catalogFiles).toEqual([
      "batch_095.json",
      "batch_095 (2).json",
    ]);

    const after = await readStore();
    expect(after.conversations.map((row) => row.sourceFile).sort()).toEqual([
      "already.csv",
      "batch_095 (2).json",
      "batch_095.json",
    ]);
    expect(
      after.conversations.find((row) => row.sourceFile === "already.csv")
        ?.externalId,
    ).toBe("wa-reupload-1");
  });

  it("returns 409 when Partner Demo Zerodha would be replaced without confirm", async () => {
    const before = await readStore();
    const priorCount = before.conversations.length;
    before.pilot = {
      baselineOpportunities: before.pilot?.baselineOpportunities ?? 12,
      updatedAt: new Date().toISOString(),
      lastUploadedFileName: ZERODHA_BATCH02_SAMPLE_NAME,
    };
    await writeStore(before);

    const blocked = await POST(
      ingestRequest(csvFile("Groww_batch_02.csv", [LEAD_LINE]))
    );
    expect(blocked.status).toBe(409);
    await expect(blocked.json()).resolves.toEqual({
      error: PARTNER_DEMO_REPLACE_CONFIRM_MESSAGE,
      code: PARTNER_DEMO_REPLACE_CONFIRM_CODE,
    });

    const afterBlocked = await readStore();
    expect(afterBlocked.conversations).toHaveLength(priorCount);
    expect(afterBlocked.pilot?.lastUploadedFileName).toBe(
      ZERODHA_BATCH02_SAMPLE_NAME
    );
  });

  it("replaces Partner Demo Zerodha when confirm_partner_demo_replace is set", async () => {
    const before = await readStore();
    before.pilot = {
      baselineOpportunities: before.pilot?.baselineOpportunities ?? 12,
      updatedAt: new Date().toISOString(),
      lastUploadedFileName: ZERODHA_BATCH02_SAMPLE_NAME,
    };
    await writeStore(before);

    const confirmed = await POST(
      ingestRequest(csvFile("Groww_batch_02.csv", [LEAD_LINE]), {
        confirmPartnerDemoReplace: true,
      })
    );
    expect(confirmed.status).toBe(200);
    const body = (await confirmed.json()) as { replaced?: boolean };
    expect(body.replaced).toBe(true);

    const after = await readStore();
    expect(after.conversations).toHaveLength(1);
    expect(after.conversations[0].externalId).toBe("wa-reupload-1");
    expect(after.pilot?.lastUploadedFileName).toBe("Groww_batch_02.csv");
  });

  it("Day-1 Groww last upload replaces without Partner Demo confirm", async () => {
    const before = await readStore();
    expect(before.pilot?.lastUploadedFileName).toBe("Groww_batch_02");

    const response = await POST(
      ingestRequest(csvFile("user-day1.csv", [LEAD_LINE]))
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { replaced?: boolean };
    expect(body.replaced).toBe(true);
    expect((await readStore()).conversations).toHaveLength(1);
  });

  it("still increments weeklyExportCount when Neon pilot PUT fails", async () => {
    vi.spyOn(backendClient, "putPilotSettings").mockRejectedValue(
      new BackendClientError("database_unavailable", 500)
    );

    const response = await POST(
      ingestRequest(csvFile("real-partner-export.local.csv", [LEAD_LINE]))
    );
    expect(response.status).toBe(200);

    const after = await readStore();
    expect(after.pilot?.weeklyExportCount).toBe(1);
    expect(after.pilot?.lastUploadedFileName).toBe(
      "real-partner-export.local.csv"
    );
    expect(backendClient.putPilotSettings).toHaveBeenCalledWith(
      "tenant_demo",
      expect.objectContaining({
        weekly_export_count: 1,
        last_uploaded_file_name: "real-partner-export.local.csv",
      })
    );
    const putBody = vi.mocked(backendClient.putPilotSettings).mock.calls[0]?.[1];
    expect(putBody).not.toHaveProperty("lastUploadedFileName");
  });

  it("awaits Neon dual-write and returns its stats", async () => {
    vi.mocked(persistDeferredIngestDualWrite).mockResolvedValue({
      predictionSync: {
        attempted: 1,
        created: 1,
        updated: 0,
        failed: 0,
        skipped: 0,
      },
      conversationSync: {
        attempted: 1,
        created: 1,
        updated: 0,
        failed: 0,
        skipped: 0,
        messagesCreated: 1,
        messagesUpdated: 0,
      },
    });

    const response = await POST(
      ingestRequest(csvFile("real-partner-export.local.csv", [LEAD_LINE]))
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      importedConversations: number;
      newSignals: number;
      replaced?: boolean;
      syncError?: string;
      predictionSync?: { attempted: number; created: number; failed: number };
      conversationSync?: { attempted: number; failed: number };
    };
    expect(body.importedConversations).toBe(1);
    expect(body.newSignals).toBeGreaterThan(0);
    expect(body.replaced).toBe(true);
    expect(body.syncError).toBeUndefined();
    expect(body.predictionSync).toEqual({
      attempted: 1,
      created: 1,
      updated: 0,
      failed: 0,
      skipped: 0,
    });
    expect(body.conversationSync?.attempted).toBe(1);
    expect(body.conversationSync?.failed).toBe(0);
    expect(persistDeferredIngestDualWrite).toHaveBeenCalledTimes(1);
    expect(persistDeferredIngestDualWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant_demo",
        replaceShowcase: true,
        storeUpdatedAt: expect.any(String),
        lastUploadedFileName: "real-partner-export.local.csv",
        conversations: expect.arrayContaining([
          expect.objectContaining({ externalId: "wa-reupload-1" }),
        ]),
        signals: expect.arrayContaining([
          expect.objectContaining({ type: "lead" }),
        ]),
      })
    );
  });

  it("returns 502 when the Neon dual-write throws", async () => {
    vi.mocked(persistDeferredIngestDualWrite).mockRejectedValue(
      new Error("database_unavailable")
    );
    const response = await POST(
      ingestRequest(csvFile("real-partner-export.local.csv", [LEAD_LINE]))
    );
    expect(response.status).toBe(502);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toMatch(/Neon/);
    const afterWrite = await readStore();
    expect(afterWrite.conversations.length).toBeGreaterThan(0);
  });

  it("surfaces a syncError when Neon reports failed rows", async () => {
    vi.mocked(persistDeferredIngestDualWrite).mockResolvedValue({
      predictionSync: {
        attempted: 1,
        created: 0,
        updated: 0,
        failed: 1,
        skipped: 0,
      },
      conversationSync: {
        attempted: 1,
        created: 0,
        updated: 0,
        failed: 0,
        skipped: 0,
        messagesCreated: 0,
        messagesUpdated: 0,
      },
    });
    const response = await POST(
      ingestRequest(csvFile("real-partner-export.local.csv", [LEAD_LINE]))
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { syncError?: string };
    expect(body.syncError).toMatch(/Neon/);
  });

  it("records chats the second pass skipped on a dump", async () => {
    vi.spyOn(detectLlm, "runHybridDetection").mockResolvedValue({
      signals: [],
      llm: {
        enabled: true,
        candidates: 12,
        attempted: 8,
        added: 0,
        failed: 0,
        skipped: 4,
        skippedIds: ["conv_a", "conv_b", "conv_c", "conv_d"],
      },
    });

    const response = await POST(
      ingestRequest(csvFile("real-partner-export.local.csv", [LEAD_LINE]))
    );
    expect(response.status).toBe(200);
    const after = await readStore();
    expect(after.llmSkippedConversationIds).toEqual([
      "conv_a",
      "conv_b",
      "conv_c",
      "conv_d",
    ]);
    // Failed ledger preflight disables provider calls for demo tenants too.
    expect(detectLlm.runHybridDetection).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Array),
      "tenant_demo",
      expect.anything(),
      { skipLlmReason: "ledger" }
    );
  });
});

describe("POST /api/ingest validation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("rejects a request with no file", async () => {
    const res = await POST(
      new Request("http://localhost/api/ingest", {
        method: "POST",
        body: new FormData(),
      })
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "file is required" });
  });

  it("rejects a header-only CSV with no conversations", async () => {
    const res = await POST(
      ingestRequest(
        csvFile("empty-pack.csv", [])
      )
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "No conversations found in file",
    });
  });

  it("rejects CSV missing required columns as 400", async () => {
    const file = new File(
      ["id,text\n1,hello"],
      "bad.csv",
      { type: "text/csv" }
    );
    const res = await POST(ingestRequest(file));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/conversation_id, role, content/i);
  });

  it("rejects JSON that is not a conversation list as 400", async () => {
    const file = new File(['{"ok":true}'], "export.json", {
      type: "application/json",
    });
    const res = await POST(ingestRequest(file));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/conversations/i);
  });

  it("treats replace=1 as a full replace after a prior partner export", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("backend unavailable in tests"))
    );
    await resetStore();

    const first = await POST(
      ingestRequest(csvFile("real-partner-export.local.csv", [LEAD_LINE, NEW_CONV_LINE]))
    );
    expect(first.status).toBe(200);
    expect((await readStore()).conversations).toHaveLength(2);

    const form = new FormData();
    form.append(
      "file",
      csvFile("real-partner-export.week2.local.csv", [LEAD_LINE_UPDATED])
    );
    form.append("replace", "1");
    const second = await POST(
      new Request("http://localhost/api/ingest", { method: "POST", body: form })
    );
    expect(second.status).toBe(200);
    const body = (await second.json()) as { replaced?: boolean };
    expect(body.replaced).toBe(true);
    expect((await readStore()).conversations).toHaveLength(1);
  });

  it("keeps every file from one real export and stamps sourceFile", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("backend unavailable in tests"))
    );
    await resetStore();
    const before = await readStore();
    before.pilot = {
      baselineOpportunities: 12,
      weeklyExportCount: 0,
    };
    await writeStore(before);

    const form = new FormData();
    form.append("file", csvFile("real-partner-export.local.csv", [LEAD_LINE]));
    form.append(
      "file",
      csvFile("real-partner-export.week2.local.csv", [NEW_CONV_LINE]),
    );
    const response = await POST(
      new Request("http://localhost/api/ingest", { method: "POST", body: form }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      replaced?: boolean;
      fileCount?: number;
      importedConversations?: number;
    };
    expect(body.replaced).toBe(true);
    expect(body.fileCount).toBe(2);
    expect(body.importedConversations).toBe(2);

    const after = await readStore();
    expect(after.conversations).toHaveLength(2);
    expect(after.conversations.map((row) => row.sourceFile).sort()).toEqual([
      "real-partner-export.local.csv",
      "real-partner-export.week2.local.csv",
    ]);
    expect(after.pilot?.weeklyExportCount).toBe(2);
    expect(after.pilot?.lastUploadedFileName).toBe(
      "real-partner-export.week2.local.csv",
    );
    expect(after.pilot?.baselineOpportunities).toBe(12);
  });
});
