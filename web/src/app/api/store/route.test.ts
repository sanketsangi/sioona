import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as backendClient from "@/lib/backend-client";
import { EXPECTED_TESTING_JSON } from "@/lib/testing-json-eval";
import { POST } from "./route";

describe("POST /api/store reset", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("backend unavailable in tests"))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("wipes Neon then reseeds testing.json and reports wipeFailed when down", async () => {
    const wipeSpy = vi
      .spyOn(backendClient, "wipeTenantData")
      .mockRejectedValue(new Error("Signal Score backend unreachable"));

    const res = await POST(
      new Request("http://localhost/api/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      })
    );
    const body = (await res.json()) as {
      conversations: unknown[];
      wipeFailed?: boolean;
      wipeError?: string;
      taxonomyOverrides?: unknown;
    };

    expect(res.status).toBe(200);
    expect(wipeSpy).toHaveBeenCalledWith("tenant_demo");
    expect(body.conversations).toHaveLength(EXPECTED_TESTING_JSON.conversations);
    expect(body.taxonomyOverrides).toEqual({});
    expect(body.wipeFailed).toBe(true);
    expect(body.wipeError).toMatch(/unreachable/i);
  });

  it("omits wipeFailed when Neon wipe succeeds", async () => {
    const wipeSpy = vi.spyOn(backendClient, "wipeTenantData").mockResolvedValue({
      conversations: 2,
      messages: 4,
      predictions: 1,
      feedback: 1,
      pilot_settings: 1,
    });

    const res = await POST(
      new Request("http://localhost/api/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      })
    );
    const body = (await res.json()) as {
      wipeFailed?: boolean;
      conversations: unknown[];
    };

    expect(res.status).toBe(200);
    expect(wipeSpy).toHaveBeenCalledWith("tenant_demo");
    expect(body.wipeFailed).toBeUndefined();
    expect(body.conversations).toHaveLength(EXPECTED_TESTING_JSON.conversations);
  });
});
