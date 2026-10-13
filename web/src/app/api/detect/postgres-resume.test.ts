import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BackendConversation } from "@/lib/backend-client";
import * as backend from "@/lib/backend-client";
import * as detectLlm from "@/lib/detect-llm";
import { readStore } from "@/lib/store";
import { runWithTenant } from "@/lib/tenant-context";
import { POST } from "./route";
import { POST as redetect } from "../store/route";

function chat(id: string, length: number): BackendConversation {
  return {
    id: `${id}-row`,
    tenant_id: "tenant_demo",
    conversation_id: id,
    channel: "chat",
    customer_name: null,
    external_id: null,
    started_at: "2026-10-04T00:00:00Z",
    created_at: "2026-10-04T00:00:00Z",
    updated_at: "2026-10-04T00:00:00Z",
    messages: [{
      id: `${id}-message`,
      tenant_id: "tenant_demo",
      conversation_id: id,
      message_id: `${id}-m`,
      role: "customer",
      content: `${id} ${"x".repeat(length)}`,
      timestamp: "2026-10-04T00:00:00Z",
      created_at: "2026-10-04T00:00:00Z",
    }],
  };
}

const resume = {
  written: false,
  failed: [] as string[],
  skipped: [] as string[],
};
let cap = 1;
let version = 1;
let duringClassification: (() => void) | undefined;
const failing = new Set<string>();
const classified: string[] = [];

function detect() {
  return POST(new Request("http://localhost/api/detect", { method: "POST" }));
}

describe("Postgres detection resume", () => {
  beforeEach(() => {
    resume.written = false;
    resume.failed = [];
    resume.skipped = [];
    cap = 1;
    version = 1;
    duringClassification = undefined;
    failing.clear();
    classified.length = 0;
    vi.stubEnv("SIOONA_STATE_MODE", "postgres");
    vi.stubEnv("SIOONA_TAXONOMY_NEON", "1");
    vi.stubEnv("DETECT_LLM", "");
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/taxonomy-overrides")) {
        return Response.json({});
      }
      if (!url.includes("/detection-resume")) throw new Error(`Unexpected network call ${url}`);
      if ((init?.method ?? "GET") === "PUT") {
        const body = JSON.parse(String(init?.body)) as {
          failed_conversation_ids: string[];
          skipped_conversation_ids: string[];
          expected_updated_at?: string;
        };
        const stale = body.expected_updated_at && body.expected_updated_at !== `2026-10-04T00:00:0${version}Z`;
        resume.failed = stale ? [...new Set([...resume.failed, ...body.failed_conversation_ids])] : body.failed_conversation_ids;
        resume.skipped = stale ? [...new Set([...resume.skipped, ...body.skipped_conversation_ids])] : body.skipped_conversation_ids;
        version += 1;
        resume.written = true;
        return Response.json({
          tenant_id: "tenant_demo",
          failed_conversation_ids: resume.failed,
          skipped_conversation_ids: resume.skipped,
          updated_at: `2026-10-04T00:00:0${version}Z`,
        });
      }
      if (!resume.written) {
        return Response.json({ detail: "detection_resume_not_found" }, { status: 404 });
      }
      return Response.json({
        tenant_id: "tenant_demo",
        failed_conversation_ids: resume.failed,
        skipped_conversation_ids: resume.skipped,
        updated_at: `2026-10-04T00:00:0${version}Z`,
      });
    }));
    vi.spyOn(backend, "getTaxonomyOverrides").mockResolvedValue({});
    vi.spyOn(backend, "putTaxonomyOverrides").mockResolvedValue(undefined);
    vi.spyOn(backend, "getPilotSettings").mockResolvedValue(null);
    vi.spyOn(backend, "getActiveUploads").mockResolvedValue([]);
    vi.spyOn(backend, "getTenantSignalsPage").mockResolvedValue({ predictions: [], next_cursor: null });
    vi.spyOn(backend, "getSupervisedActionDecisions").mockResolvedValue([]);
    vi.spyOn(backend, "publishDetectionRun").mockImplementation(async (_tenant, runId) => ({
      run_id: runId,
      predictions: [],
    }));
    const realDetect = detectLlm.runHybridDetection;
    vi.spyOn(detectLlm, "runHybridDetection").mockImplementation(async (conversations, messages, tenantId, overrides, options) => {
      duringClassification?.();
      duringClassification = undefined;
      return realDetect(conversations, messages, tenantId, overrides, {
        ...options,
        maxCalls: cap,
        concurrency: 1,
        classify: async (input) => {
          classified.push(input.conversation.id);
          if (failing.has(input.conversation.id)) throw new Error("classification failed");
          return { type: "none", confidence: 0.9, summary: "none", quotes: [] };
        },
      });
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("classifies previously skipped chats first after a canonical reload until every chat completes", async () => {
    vi.spyOn(backend, "getConversations").mockResolvedValue([
      chat("long", 80),
      chat("mid", 40),
      chat("short", 10),
    ]);
    cap = 1;
    const order: string[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      classified.length = 0;
      const response = await detect();
      expect(response.status).toBe(200);
      await runWithTenant("tenant_demo", () => readStore());
      order.push(classified[0] ?? "");
    }
    expect(order).toEqual(["long", "mid", "short"]);
  });

  it("retries a failed classification before the chats that already succeeded", async () => {
    vi.spyOn(backend, "getConversations").mockResolvedValue([
      chat("long", 80),
      chat("next", 60),
      chat("later", 40),
      chat("last", 20),
    ]);
    cap = 2;
    failing.add("next");
    classified.length = 0;
    const failed = await detect();
    expect(failed.status).toBe(503);
    expect(backend.publishDetectionRun).not.toHaveBeenCalled();
    await runWithTenant("tenant_demo", () => readStore());
    failing.clear();
    classified.length = 0;
    const retried = await detect();
    expect(retried.status).toBe(200);
    expect(classified[0]).toBe("next");
  });
  const routes = [
    { name: "detect", invoke: detect },
    { name: "redetect", invoke: () => redetect(new Request("http://localhost/api/store", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_taxonomy_override", type: "lead", field: "phrases", value: "synthetic phrase" }),
    })) },
  ];
  it.each(routes)("$name retains unpublished pending chats and retries them first", async ({ invoke }) => {
    vi.spyOn(backend, "getConversations").mockResolvedValue([chat("long", 80), chat("mid", 40)]);
    resume.written = true;
    resume.skipped = ["mid"];
    vi.mocked(backend.publishDetectionRun).mockRejectedValueOnce(new Error("commit failed"));
    const response = await invoke();
    expect(response.status).toBeGreaterThanOrEqual(400);
    const reloaded = await runWithTenant("tenant_demo", () => readStore());
    expect([...(reloaded.llmFailedConversationIds ?? []), ...(reloaded.llmSkippedConversationIds ?? [])]).toContain("mid");
    classified.length = 0;
    expect((await detect()).status).toBe(200);
    expect(classified[0]).toBe("mid");
  });

  it.each(routes)("$name preserves a concurrent failure saved during classification", async ({ invoke }) => {
    vi.spyOn(backend, "getConversations").mockResolvedValue([chat("long", 80), chat("mid", 40)]);
    resume.written = true;
    cap = 2;
    duringClassification = () => {
      resume.failed = ["mid"];
      version += 1;
    };
    expect((await invoke()).status).toBe(200);
    const fresh = await runWithTenant("tenant_demo", () => readStore());
    expect(fresh.llmFailedConversationIds).toContain("mid");
  });

  it.each(routes)("$name preserves pending A when A succeeds and B fails, surviving canonical reload and capped retry", async ({ invoke }) => {
    vi.spyOn(backend, "getConversations").mockResolvedValue([
      chat("chatA", 80),
      chat("chatB", 60),
      chat("chatC", 40),
    ]);
    resume.written = true;
    resume.failed = ["chatA", "chatB"];
    resume.skipped = ["chatC"];
    cap = 2;
    failing.add("chatB");
    classified.length = 0;

    const failed = await invoke();
    expect(failed.status).toBeGreaterThanOrEqual(400);
    expect(backend.publishDetectionRun).not.toHaveBeenCalled();

    // Canonical reload
    const reloaded = await runWithTenant("tenant_demo", () => readStore());
    const pendingIds = [
      ...(reloaded.llmFailedConversationIds ?? []),
      ...(reloaded.llmSkippedConversationIds ?? []),
    ];
    expect(pendingIds).toContain("chatA");
    expect(pendingIds).toContain("chatB");
    expect(pendingIds).toContain("chatC");

    // Capped retry
    failing.clear();
    cap = 1;
    classified.length = 0;
    const retried = await detect();
    expect(retried.status).toBe(200);
    expect(pendingIds).toContain(classified[0]);
  });

});
