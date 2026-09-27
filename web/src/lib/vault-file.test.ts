import { describe, expect, it } from "vitest";
import {
  GROWW_SHOWCASE_SAMPLE_NAME,
  ZERODHA_BATCH02_SAMPLE_NAME,
} from "@/lib/partner-demo-replace-guard";
import {
  defaultInsightsHref,
  insightsHomeHref,
  isLivePartnerKeepSet,
  livePartnerVaultChrome,
  vaultKeepSetRefreshDelay,
  isVaultBatchRenderable,
  parseVaultFile,
  resolveHeaderBatchName,
  resolveInsightsVaultFile,
  resolveVaultActiveFile,
  scopeChatsToUploadedFile,
  vaultFileEmptyNext,
  vaultFileIsLoaded,
  vaultFileMatchesKeepSet,
  vaultInsightsHref,
} from "./vault-file";

describe("parseVaultFile", () => {
  it("trims and rejects blanks", () => {
    expect(parseVaultFile("  Groww_batch_02  ")).toBe("Groww_batch_02");
    expect(parseVaultFile("")).toBeNull();
    expect(parseVaultFile("   ")).toBeNull();
    expect(parseVaultFile(undefined)).toBeNull();
    expect(parseVaultFile(null)).toBeNull();
  });
});

describe("resolveInsightsVaultFile", () => {
  it("defaults bare Insights to Sample", () => {
    expect(resolveInsightsVaultFile(null)).toBe(GROWW_SHOWCASE_SAMPLE_NAME);
    expect(resolveInsightsVaultFile(undefined)).toBe(GROWW_SHOWCASE_SAMPLE_NAME);
    expect(resolveInsightsVaultFile("")).toBe(GROWW_SHOWCASE_SAMPLE_NAME);
  });

  it("keeps a weekly upload when bare Insights has that keep-set", () => {
    expect(
      resolveInsightsVaultFile(null, "Zerodha_week_7_batch_01.json"),
    ).toBe("Zerodha_week_7_batch_01.json");
    expect(resolveInsightsVaultFile(null, GROWW_SHOWCASE_SAMPLE_NAME)).toBe(
      GROWW_SHOWCASE_SAMPLE_NAME,
    );
  });

  it("keeps an explicit ?file=", () => {
    expect(resolveInsightsVaultFile(ZERODHA_BATCH02_SAMPLE_NAME)).toBe(
      ZERODHA_BATCH02_SAMPLE_NAME,
    );
    expect(resolveInsightsVaultFile("  user-upload.csv  ")).toBe(
      "user-upload.csv",
    );
  });
});

describe("vaultInsightsHref", () => {
  it("opens Insights with file scope", () => {
    const href = vaultInsightsHref(GROWW_SHOWCASE_SAMPLE_NAME);
    const params = new URL(href, "http://localhost").searchParams;
    expect(params.get("view")).toBe("insights");
    expect(params.get("file")).toBe(GROWW_SHOWCASE_SAMPLE_NAME);
  });
});

describe("defaultInsightsHref", () => {
  it("opens Insights scoped to Sample", () => {
    const href = defaultInsightsHref();
    const params = new URL(href, "http://localhost").searchParams;
    expect(params.get("view")).toBe("insights");
    expect(params.get("file")).toBe(GROWW_SHOWCASE_SAMPLE_NAME);
  });
});

describe("vaultFileMatchesKeepSet", () => {
  it("matches Sample names with or without extension", () => {
    expect(
      vaultFileMatchesKeepSet(GROWW_SHOWCASE_SAMPLE_NAME, "Groww_batch_02.csv"),
    ).toBe(true);
    expect(
      vaultFileMatchesKeepSet(
        ZERODHA_BATCH02_SAMPLE_NAME,
        ZERODHA_BATCH02_SAMPLE_NAME,
      ),
    ).toBe(true);
  });

  it("matches exact upload basenames", () => {
    expect(
      vaultFileMatchesKeepSet(
        "Zerodha_week_5_batch_01.json",
        "Zerodha_week_5_batch_01.json",
      ),
    ).toBe(true);
  });

  it("matches an uploaded file across extension, case, and source stamp", () => {
    expect(vaultFileMatchesKeepSet("batch_02.json", "batch_02")).toBe(true);
    expect(vaultFileMatchesKeepSet("batch_02.json", "Batch_02.JSON")).toBe(
      true,
    );
    expect(
      vaultFileMatchesKeepSet("batch_02.json", "exports/batch_02.json"),
    ).toBe(true);
    expect(vaultFileIsLoaded("batch_02.json", "Batch_02.JSON")).toBe(true);
    expect(
      vaultFileMatchesKeepSet("batch_02.json", GROWW_SHOWCASE_SAMPLE_NAME),
    ).toBe(true);
    expect(
      vaultFileIsLoaded("batch_02.json", "notes.csv", ["batch_02", "notes.csv"]),
    ).toBe(true);
  });

  it("is false when keep-set is a different pack", () => {
    expect(
      vaultFileMatchesKeepSet(
        GROWW_SHOWCASE_SAMPLE_NAME,
        "Zerodha_week_5_batch_01.json",
      ),
    ).toBe(false);
    expect(
      vaultFileMatchesKeepSet(
        ZERODHA_BATCH02_SAMPLE_NAME,
        "Zerodha_week_5_batch_01.json",
      ),
    ).toBe(false);
    expect(
      vaultFileMatchesKeepSet("batch_02.json", "Zerodha_week_5_batch_01.json"),
    ).toBe(false);
    expect(
      vaultFileMatchesKeepSet("batch_02.json", "batch_02 (2).json"),
    ).toBe(false);
  });

  it("matches a Finder duplicate name to the uploaded keep-set", () => {
    expect(
      vaultFileMatchesKeepSet(
        "Zerodha_week_7_batch_01 copy.json",
        "Zerodha_week_7_batch_01.json",
      ),
    ).toBe(true);
    expect(
      vaultFileMatchesKeepSet(
        "Zerodha_week_7_batch_01 copy 2.json",
        "Zerodha_week_7_batch_01.json",
      ),
    ).toBe(true);
    expect(
      vaultFileIsLoaded(
        "Zerodha_week_7_batch_01 copy.json",
        "Zerodha_week_7_batch_01.json",
        ["Zerodha_week_7_batch_01.json"],
        20,
      ),
    ).toBe(true);
  });
});

describe("scopeChatsToUploadedFile", () => {
  it("keeps chats when sourceFile or the keep-set only differs by extension", () => {
    const chats = {
      conversations: [
        {
          id: "conv_rucha",
          tenantId: "tenant_demo",
          channel: "whatsapp" as const,
          startedAt: "2026-08-01T00:00:00.000Z",
          messageIds: [],
          sourceFile: "batch_02",
        },
        {
          id: "conv_other",
          tenantId: "tenant_demo",
          channel: "whatsapp" as const,
          startedAt: "2026-08-01T00:00:00.000Z",
          messageIds: [],
          sourceFile: "notes.csv",
        },
      ],
      messages: [],
    };
    const scoped = scopeChatsToUploadedFile(
      chats,
      "batch_02.json",
      ["batch_02", "notes.csv"],
      "Batch_02.JSON",
    );
    expect(scoped.conversations.map((conversation) => conversation.id)).toEqual(
      ["conv_rucha"],
    );
  });

  it("does not drop an unstamped keep-set chat when another file is listed", () => {
    const chats = {
      conversations: [
        {
          id: "conv_rucha",
          tenantId: "tenant_demo",
          channel: "whatsapp" as const,
          startedAt: "2026-08-01T00:00:00.000Z",
          messageIds: [],
        },
        {
          id: "conv_notes",
          tenantId: "tenant_demo",
          channel: "whatsapp" as const,
          startedAt: "2026-08-01T00:00:00.000Z",
          messageIds: [],
          sourceFile: "notes.csv",
        },
      ],
      messages: [],
    };
    const scoped = scopeChatsToUploadedFile(
      chats,
      "batch_02.json",
      ["batch_02.json", "notes.csv"],
      "batch_02.json",
    );
    expect(scoped.conversations.map((conversation) => conversation.id)).toContain(
      "conv_rucha",
    );
    expect(scoped.conversations.map((conversation) => conversation.id)).not.toContain(
      "conv_notes",
    );
  });
});

describe("resolveHeaderBatchName", () => {
  it("prefers selected vault file while a showcase pack is loading", () => {
    expect(
      resolveHeaderBatchName({
        vaultFile: ZERODHA_BATCH02_SAMPLE_NAME,
        lastUploadedFileName: GROWW_SHOWCASE_SAMPLE_NAME,
      }),
    ).toBe(ZERODHA_BATCH02_SAMPLE_NAME);
  });

  it("falls back to keep-set when URL omits file", () => {
    expect(
      resolveHeaderBatchName({
        vaultFile: null,
        lastUploadedFileName: "Zerodha_week_5_batch_01.json",
      }),
    ).toBe("Zerodha_week_5_batch_01.json");
  });
});

describe("isVaultBatchRenderable", () => {
  it("is false while the selected vault is not the keep-set", () => {
    expect(
      isVaultBatchRenderable(
        ZERODHA_BATCH02_SAMPLE_NAME,
        GROWW_SHOWCASE_SAMPLE_NAME,
      ),
    ).toBe(false);
  });

  it("is true when selected vault matches keep-set", () => {
    expect(
      isVaultBatchRenderable(
        ZERODHA_BATCH02_SAMPLE_NAME,
        ZERODHA_BATCH02_SAMPLE_NAME,
      ),
    ).toBe(true);
  });

  it("is true when the selected file is another file from the same upload", () => {
    expect(
      isVaultBatchRenderable(
        "Zerodha_week_7_batch_01.json",
        "Zerodha_week_8_batch_01.json",
        ["Zerodha_week_7_batch_01.json", "Zerodha_week_8_batch_01.json"],
      ),
    ).toBe(true);
  });
  it("is true when no vault file is selected", () => {
    expect(isVaultBatchRenderable(null, GROWW_SHOWCASE_SAMPLE_NAME)).toBe(
      true,
    );
  });
});

describe("resolveVaultActiveFile", () => {
  it("prefers URL file over keep-set breadcrumb", () => {
    expect(
      resolveVaultActiveFile({
        vaultFile: GROWW_SHOWCASE_SAMPLE_NAME,
        lastUploadedFileName: "Zerodha_week_5_batch_01.json",
      }),
    ).toBe(GROWW_SHOWCASE_SAMPLE_NAME);
  });

  it("falls back to last upload when URL omits file", () => {
    expect(
      resolveVaultActiveFile({
        vaultFile: null,
        lastUploadedFileName: "Zerodha_week_5_batch_01.json",
      }),
    ).toBe("Zerodha_week_5_batch_01.json");
  });

  it("defaults to Sample when URL and keep-set are empty", () => {
    expect(
      resolveVaultActiveFile({
        vaultFile: null,
        lastUploadedFileName: null,
      }),
    ).toBe(GROWW_SHOWCASE_SAMPLE_NAME);
    expect(
      resolveVaultActiveFile({
        vaultFile: "  ",
        lastUploadedFileName: "   ",
      }),
    ).toBe(GROWW_SHOWCASE_SAMPLE_NAME);
  });
});

describe("vaultFileIsLoaded chat count", () => {
  it("treats a weekly filename with zero chats as not loaded", () => {
    expect(
      vaultFileIsLoaded(
        "Zerodha_week_7_batch_01.json",
        "Zerodha_week_7_batch_01.json",
        ["Zerodha_week_7_batch_01.json"],
        0,
      ),
    ).toBe(false);
    expect(
      vaultFileIsLoaded(
        "Zerodha_week_7_batch_01.json",
        "Zerodha_week_7_batch_01.json",
        ["Zerodha_week_7_batch_01.json"],
        100,
      ),
    ).toBe(true);
  });
});

describe("livePartnerVaultChrome", () => {
  it("does not hide Sample when the weekly URL is not the loaded store", () => {
    expect(
      livePartnerVaultChrome({
        activeFile: "Zerodha_week_7_batch_01.json",
        lastUploadedFileName: GROWW_SHOWCASE_SAMPLE_NAME,
        chatCount: 56,
      }),
    ).toBe(false);
    expect(
      livePartnerVaultChrome({
        activeFile: "Zerodha_week_7_batch_01.json",
        lastUploadedFileName: "Zerodha_week_7_batch_01.json",
        chatCount: 100,
      }),
    ).toBe(true);
  });
});

describe("insightsHomeHref", () => {
  it("opens the weekly file instead of Sample", () => {
    expect(insightsHomeHref("Zerodha_week_7_batch_01.json")).toContain(
      "Zerodha_week_7_batch_01.json",
    );
    expect(insightsHomeHref(GROWW_SHOWCASE_SAMPLE_NAME)).toContain(
      "file=Groww_batch_02",
    );
  });
});

describe("vaultKeepSetRefreshDelay", () => {
  it("stops after the refresh budget", () => {
    expect(vaultKeepSetRefreshDelay(0)).toBe(800);
    expect(vaultKeepSetRefreshDelay(8)).toBeNull();
  });
});

describe("isLivePartnerKeepSet", () => {
  it("is true only for a real upload", () => {
    expect(isLivePartnerKeepSet("Zerodha_week_7_batch_01.json")).toBe(true);
    expect(isLivePartnerKeepSet(GROWW_SHOWCASE_SAMPLE_NAME)).toBe(false);
    expect(isLivePartnerKeepSet(ZERODHA_BATCH02_SAMPLE_NAME)).toBe(false);
    expect(isLivePartnerKeepSet(undefined)).toBe(false);
  });
});

describe("vaultFileEmptyNext", () => {
  it("points Sample and Partner Demo at Upload", () => {
    expect(vaultFileEmptyNext(GROWW_SHOWCASE_SAMPLE_NAME).label).toBe(
      "Open Upload",
    );
    expect(vaultFileEmptyNext(ZERODHA_BATCH02_SAMPLE_NAME).href).toContain(
      "view=upload",
    );
  });

  it("points unknown uploads at Uploaded Chats", () => {
    const next = vaultFileEmptyNext("partner-export.json");
    expect(next.label).toBe("Upload this week’s export");
    expect(next.title).toBe("Upload this week’s export");
  });
});
