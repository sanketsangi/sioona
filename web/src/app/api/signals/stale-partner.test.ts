import { afterEach, describe, expect, it, vi } from "vitest";
import { signSession, sessionCookie } from "@/lib/auth-token";
const mocks = vi.hoisted(() => ({ create: vi.fn(), review: vi.fn(), acted: vi.fn(), write: vi.fn() }));
vi.mock("@/lib/backend-client", () => ({
  BackendClientError: class extends Error { constructor(message: string, public status: number) { super(message); } },
  createPrediction: mocks.create, submitFeedback: mocks.review, setPredictionActed: mocks.acted,
}));
vi.mock("@/lib/store", () => ({
  readStore: async () => ({ tenant: { id: "tenant_partner" }, signals: [{
    id: "signal-old", tenantId: "tenant_partner", conversationId: "c1", type: "lead",
    confidence: .9, summary: "Old intent", backendSignalId: "old-prediction",
    feedback: { label: "correct" },
  }] }),
  setSignalFeedback: mocks.write, setSignalActed: mocks.write, writeStore: mocks.write,
}));
import { BackendClientError } from "@/lib/backend-client";
import { POST as feedback } from "./[id]/feedback/route";
import { POST as acted } from "./[id]/acted/route";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("superseded partner prediction", () => {
  it.each([["review", feedback, { label: "correct" }], ["acted", acted, { acted: true }]] as const)(
    "rejects stale %s without recreating or locally acknowledging it", async (_, handler, body) => {
      vi.stubEnv("SIOONA_AUTH_ENFORCE", "1");
      vi.stubEnv("AUTH_SECRET", "stale-partner-test-session-secret");
      const token = await signSession({ tenantId: "tenant_partner", role: "reviewer", email: "reviewer@example.test" });
      mocks.review.mockRejectedValue(new BackendClientError("superseded", 404));
      mocks.acted.mockRejectedValue(new BackendClientError("superseded", 404));
      const response = await handler(new Request("http://localhost/api/signals/signal-old", {
        method: "POST", headers: { cookie: sessionCookie(token).split(";")[0], "Content-Type": "application/json" }, body: JSON.stringify(body),
      }), { params: Promise.resolve({ id: "signal-old" }) });
      expect(response.status).toBe(409);
      expect(mocks.create).not.toHaveBeenCalled();
      expect(mocks.write).not.toHaveBeenCalled();
    });
});
