import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { runDetection } from "@/lib/detect";
import { PARTNER_EXPORT_ADAPT_OVERRIDES } from "@/data/fixtures/partner-export-overrides";
import {
  readStore,
  resetStore,
  setSignalActed,
  setSignalFeedback,
  writeStore,
} from "@/lib/store";
import { EXPECTED_TESTING_JSON } from "@/lib/testing-json-eval";

const LEAD_LINE =
  'wa-reupload-1,customer,"Hi, I want to open a demat account this week",Asha,whatsapp,lead';
const LEAD_LINE_UPDATED =
  'wa-reupload-1,customer,"Hi, I want to open a demat account today please",Asha,whatsapp,lead';
const NEW_CONV_LINE =
  'wa-reupload-2,customer,"Hi, I want to open a demat account this week",Neha,whatsapp,lead';

function csvFile(name: string, rows: string[]) {
  const csv = [
    "conversation_id,role,content,customer_name,channel,ground_truth",
    ...rows,
  ].join("\n");
  return new File([csv], name, { type: "text/csv" });
}

function ingestRequest(file: File, replace?: boolean) {
  const body = new FormData();
  body.append("file", file);
  if (replace) body.append("replace", "true");
  return new Request("http://localhost/api/ingest", {
    method: "POST",
    body,
  });
}

describe("POST /api/ingest", () => {
  beforeEach(async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("backend unavailable in tests"))
    );
    await resetStore();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
      ingestRequest(csvFile("week1.csv", [LEAD_LINE]))
    );
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as {
      importedConversations: number;
      replaced?: boolean;
      conversationPrune?: { skipped: boolean };
    };
    expect(firstBody.importedConversations).toBe(1);
    expect(firstBody.replaced).toBe(true);
    expect(firstBody.conversationPrune?.skipped).toBe(true);

    const afterFirst = await readStore();
    expect(afterFirst.conversations).toHaveLength(1);
    expect(
      afterFirst.conversations.every((conversation) => !showcaseIds.has(conversation.id))
    ).toBe(true);
    expect(afterFirst.conversations[0].externalId).toBe("wa-reupload-1");
    expect(afterFirst.pilot?.weeklyExportCount).toBe(1);
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

  it("merges partner-export Adapt into store and changes detect vs base", async () => {
    const before = await readStore();
    before.pilot = {
      baselineOpportunities: 0,
      weeklyExportCount: 0,
    };
    before.taxonomyOverrides = { lead: { phrases: ["demat account"] } };
    await writeStore(before);

    const first = await POST(
      ingestRequest(
        csvFile("partner-week1.csv", [
          'upsell_pr,customer,"Portfolio review please. I am already doing SIPs. Yes, send the link. I want to open/start this week.",Ada,whatsapp,upsell',
        ])
      )
    );
    expect(first.status).toBe(200);

    const after = await readStore();
    expect(after.taxonomyOverrides?.lead?.phrases).toEqual(["demat account"]);
    expect(after.taxonomyOverrides?.lead?.negativePhrases).toEqual(
      PARTNER_EXPORT_ADAPT_OVERRIDES.lead?.negativePhrases
    );
    expect(after.taxonomyOverrides?.upsell?.phrases).toEqual(
      PARTNER_EXPORT_ADAPT_OVERRIDES.upsell?.phrases
    );

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
    expect(adapted.some((signal) => signal.type === "upsell")).toBe(true);
    expect(adapted.some((signal) => signal.type === "lead")).toBe(false);
  });

  it("upserts the same conversation_id instead of appending a duplicate", async () => {
    const first = await POST(
      ingestRequest(csvFile("week1.csv", [LEAD_LINE]))
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
      ingestRequest(csvFile("week2.csv", [LEAD_LINE_UPDATED]))
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
  });

  it("keeps SignalScore feedback and Acted across re-upload", async () => {
    const first = await POST(
      ingestRequest(csvFile("week1.csv", [LEAD_LINE]))
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
      ingestRequest(csvFile("week2.csv", [LEAD_LINE_UPDATED]))
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
      ingestRequest(csvFile("week1.csv", [LEAD_LINE]))
    );
    expect(first.status).toBe(200);
    expect((await readStore()).pilot?.weeklyExportCount).toBe(1);

    const second = await POST(
      ingestRequest(csvFile("week2.csv", [LEAD_LINE_UPDATED]))
    );
    expect(second.status).toBe(200);
    expect((await readStore()).pilot?.weeklyExportCount).toBe(2);

    const third = await POST(
      ingestRequest(csvFile("week3.csv", [NEW_CONV_LINE]))
    );
    expect(third.status).toBe(200);

    const after = await readStore();
    expect(after.pilot?.weeklyExportCount).toBe(3);
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
      ingestRequest(csvFile("week1.csv", [LEAD_LINE, NEW_CONV_LINE]))
    );
    expect(first.status).toBe(200);
    expect((await readStore()).conversations).toHaveLength(2);

    const second = await POST(
      ingestRequest(csvFile("week2.csv", [LEAD_LINE_UPDATED]))
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
      ingestRequest(csvFile("week1.csv", [LEAD_LINE, NEW_CONV_LINE]))
    );
    expect(first.status).toBe(200);
    expect((await readStore()).pilot?.weeklyExportCount).toBe(1);

    const second = await POST(
      ingestRequest(csvFile("week2.csv", [LEAD_LINE_UPDATED]), true)
    );
    expect(second.status).toBe(200);
    const body = (await second.json()) as { replaced?: boolean };
    expect(body.replaced).toBe(true);

    const after = await readStore();
    expect(after.conversations).toHaveLength(1);
    expect(after.conversations[0].externalId).toBe("wa-reupload-1");
    expect(after.pilot?.weeklyExportCount).toBe(2);
  });
});
