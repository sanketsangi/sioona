import { describe, expect, it, vi } from "vitest";
vi.mock("./backend-client", () => ({ publishUpload: vi.fn().mockResolvedValue({ status: "completed" }) }));
import { publishUpload } from "./backend-client";
import { publishIngestUpload } from "./publish-ingest-upload";

describe("publishIngestUpload", () => {
  it("uses deterministic opaque membership identity for retries", async () => {
    const input = { tenantId: "tenant_a", source: "weekly.csv", replace: false,
      conversations: [{ id: "c1", tenantId: "tenant_a", channel: "upload", startedAt: "2026-10-01", messageIds: ["m1"] }],
      messages: [{ id: "m1", conversationId: "c1", role: "customer" as const, content: "[phone]", timestamp: "2026-10-01" }] };
    await publishIngestUpload(input);
    await publishIngestUpload(input);
    const calls = vi.mocked(publishUpload).mock.calls;
    expect(calls[0]).toEqual(calls[1]);
    expect(calls[0][1]).toMatch(/^[a-f0-9]{64}$/);
    expect(calls[0][2].conversation_ids).toEqual(["c1"]);
    await publishIngestUpload({ ...input, messages: [{ ...input.messages[0], content: "Changed request" }] });
    expect(vi.mocked(publishUpload).mock.calls[2][1]).not.toBe(calls[0][1]);
  });
});
