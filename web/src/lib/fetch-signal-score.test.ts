import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSignalScoreSafe } from "./fetch-signal-score";

vi.mock("./backend-client", () => ({
  getSignalScore: vi.fn(),
}));

import { getSignalScore } from "./backend-client";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchSignalScoreSafe", () => {
  it("passes conversation ids through to getSignalScore", async () => {
    vi.mocked(getSignalScore).mockResolvedValue({
      tenant_id: "tenant_demo",
      signal_score: 0.83,
      reviewed_count: 6,
      correct_count: 5,
      incorrect_count: 1,
      partially_correct_count: 0,
      by_signal_type: [],
    });

    const ids = ["pack_1", "pack_2"];
    const result = await fetchSignalScoreSafe("tenant_demo", ids);

    expect(getSignalScore).toHaveBeenCalledWith("tenant_demo", {
      conversationIds: ids,
    });
    expect(result?.signal_score).toBe(0.83);
    expect(result?.reviewed_count).toBe(6);
  });

  it("forwards date_from / date_to with keep-set", async () => {
    vi.mocked(getSignalScore).mockResolvedValue({
      tenant_id: "tenant_demo",
      signal_score: null,
      reviewed_count: 0,
      correct_count: 0,
      incorrect_count: 0,
      partially_correct_count: 0,
      by_signal_type: [],
    });

    await fetchSignalScoreSafe("tenant_demo", ["pack_1"], {
      dateFrom: "2026-08-07T12:00:00.000Z",
      dateTo: "2026-08-14T12:00:00.000Z",
    });

    expect(getSignalScore).toHaveBeenCalledWith("tenant_demo", {
      conversationIds: ["pack_1"],
      date_from: "2026-08-07T12:00:00.000Z",
      date_to: "2026-08-14T12:00:00.000Z",
    });
  });

  it("returns null when the backend is unreachable", async () => {
    vi.mocked(getSignalScore).mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(
      fetchSignalScoreSafe("tenant_demo", ["pack_1"])
    ).resolves.toBeNull();
  });
});
