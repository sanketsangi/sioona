import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoreData } from "./types";

vi.mock("./backend-client", () => ({
  getPilotSettings: vi.fn(),
}));

vi.mock("./hydrate-conversations", () => ({
  tryHydrateStoreFromNeon: vi.fn(),
}));

import { adoptNeonKeepSetWhenLocalMisses } from "./adopt-neon-keep-set";
import { getPilotSettings } from "./backend-client";
import { tryHydrateStoreFromNeon } from "./hydrate-conversations";

function store(overrides: Partial<StoreData> = {}): StoreData {
  return {
    tenant: {
      id: "tenant_demo",
      name: "Demo",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    conversations: [
      {
        id: "conv_groww",
        tenantId: "tenant_demo",
        channel: "in_app_chat",
        startedAt: "2026-08-01T00:00:00.000Z",
        messageIds: [],
        customerName: "Eeshan Kulkarni",
      },
    ],
    messages: [],
    signals: [],
    pilot: {
      baselineOpportunities: 0,
      lastUploadedFileName: "Groww_batch_02",
    },
    ...overrides,
  };
}

const week7 = "Zerodha_week_7_batch_01.json";

describe("adoptNeonKeepSetWhenLocalMisses", () => {
  beforeEach(() => {
    vi.mocked(getPilotSettings).mockReset();
    vi.mocked(tryHydrateStoreFromNeon).mockReset();
  });

  it("replaces Sample with the weekly Neon keep-set when ?file= is missing locally", async () => {
    vi.mocked(getPilotSettings).mockResolvedValue({
      id: "pilot-1",
      tenant_id: "tenant_demo",
      baseline_opportunities: 12,
      baseline_note: null,
      weekly_export_count: 3,
      last_uploaded_file_name: week7,
      created_at: "2026-09-27T12:00:00.000Z",
      updated_at: "2026-09-27T12:00:00.000Z",
    });
    const hydrated = store({
      conversations: [
        {
          id: "conv_aditya",
          tenantId: "tenant_demo",
          channel: "whatsapp",
          startedAt: "2026-09-27T12:00:00.000Z",
          messageIds: [],
          customerName: "Aditya Pawar",
          sourceFile: week7,
        },
        {
          id: "conv_kavita",
          tenantId: "tenant_demo",
          channel: "whatsapp",
          startedAt: "2026-09-27T12:01:00.000Z",
          messageIds: [],
          customerName: "Kavita Jadhav",
          sourceFile: week7,
        },
      ],
      pilot: {
        baselineOpportunities: 12,
        lastUploadedFileName: week7,
        weeklyExportCount: 3,
      },
    });
    vi.mocked(tryHydrateStoreFromNeon).mockResolvedValue(hydrated);

    const result = await adoptNeonKeepSetWhenLocalMisses(store(), week7);

    expect(result.pilot?.lastUploadedFileName).toBe(week7);
    expect(result.conversations.map((row) => row.customerName)).toEqual([
      "Aditya Pawar",
      "Kavita Jadhav",
    ]);
    expect(tryHydrateStoreFromNeon).toHaveBeenCalledWith({
      syncPredictions: false,
    });
  });

  it("adopts the weekly keep-set when the link is a Finder duplicate name", async () => {
    vi.mocked(getPilotSettings).mockResolvedValue({
      id: "pilot-1",
      tenant_id: "tenant_demo",
      baseline_opportunities: 12,
      baseline_note: null,
      weekly_export_count: 3,
      last_uploaded_file_name: week7,
      created_at: "2026-09-27T12:00:00.000Z",
      updated_at: "2026-09-27T12:00:00.000Z",
    });
    const hydrated = store({
      conversations: [
        {
          id: "conv_aditya",
          tenantId: "tenant_demo",
          channel: "whatsapp",
          startedAt: "2026-09-27T12:00:00.000Z",
          messageIds: [],
          customerName: "Aditya Pawar",
          sourceFile: week7,
        },
      ],
      pilot: {
        baselineOpportunities: 12,
        lastUploadedFileName: week7,
        weeklyExportCount: 3,
      },
    });
    vi.mocked(tryHydrateStoreFromNeon).mockResolvedValue(hydrated);

    const result = await adoptNeonKeepSetWhenLocalMisses(
      store(),
      "Zerodha_week_7_batch_01 copy.json",
    );

    expect(result.pilot?.lastUploadedFileName).toBe(week7);
    expect(tryHydrateStoreFromNeon).toHaveBeenCalled();
  });

  it("keeps Sample when Neon does not yet have the weekly chats", async () => {
    vi.mocked(getPilotSettings).mockResolvedValue({
      id: "pilot-1",
      tenant_id: "tenant_demo",
      baseline_opportunities: 0,
      baseline_note: null,
      weekly_export_count: 3,
      last_uploaded_file_name: week7,
      created_at: "2026-09-27T12:00:00.000Z",
      updated_at: "2026-09-27T12:00:00.000Z",
    });
    vi.mocked(tryHydrateStoreFromNeon).mockResolvedValue(null);

    const local = store();
    await expect(
      adoptNeonKeepSetWhenLocalMisses(local, week7),
    ).resolves.toBe(local);
  });

  it("does not hydrate when the weekly file is already stamped", async () => {
    const local = store({
      conversations: [
        {
          id: "conv_aditya",
          tenantId: "tenant_demo",
          channel: "whatsapp",
          startedAt: "2026-09-27T12:00:00.000Z",
          messageIds: [],
          customerName: "Aditya Pawar",
          sourceFile: week7,
        },
      ],
      pilot: { baselineOpportunities: 12, lastUploadedFileName: week7 },
    });

    await expect(adoptNeonKeepSetWhenLocalMisses(local, week7)).resolves.toBe(
      local,
    );
    expect(getPilotSettings).not.toHaveBeenCalled();
    expect(tryHydrateStoreFromNeon).not.toHaveBeenCalled();
  });
});
