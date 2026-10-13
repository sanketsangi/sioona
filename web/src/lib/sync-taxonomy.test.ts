import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getTaxonomyOverrides = vi.fn();
const putTaxonomyOverrides = vi.fn();

vi.mock("./backend-client", () => ({
  getTaxonomyOverrides: (...args: unknown[]) => getTaxonomyOverrides(...args),
  putTaxonomyOverrides: (...args: unknown[]) => putTaxonomyOverrides(...args),
}));

import {
  syncTaxonomyOverridesToBackend,
  taxonomyNeonEnabled,
  taxonomyOverridesFromNeon,
} from "./sync-taxonomy";

const KEYS = ["SIOONA_TAXONOMY_NEON", "BACKEND_URL", "VERCEL"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  getTaxonomyOverrides.mockReset();
  putTaxonomyOverrides.mockReset();
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("taxonomyNeonEnabled", () => {
  it("is off under Vitest by default", () => {
    process.env.BACKEND_URL = "http://localhost:8000";
    expect(taxonomyNeonEnabled()).toBe(false);
  });

  it("can be forced on or off", () => {
    process.env.SIOONA_TAXONOMY_NEON = "1";
    expect(taxonomyNeonEnabled()).toBe(true);
    process.env.SIOONA_TAXONOMY_NEON = "0";
    expect(taxonomyNeonEnabled()).toBe(false);
  });

  it("turns on with BACKEND_URL or on Vercel outside Vitest", () => {
    vi.stubEnv("VITEST", "");
    expect(taxonomyNeonEnabled()).toBe(false);
    process.env.BACKEND_URL = " http://x ";
    expect(taxonomyNeonEnabled()).toBe(true);
    delete process.env.BACKEND_URL;
    process.env.VERCEL = "1";
    expect(taxonomyNeonEnabled()).toBe(true);
  });
});

describe("syncTaxonomyOverridesToBackend", () => {
  it("is a no-op when Neon is disabled", async () => {
    await syncTaxonomyOverridesToBackend("tenant_a", { lead: { phrases: ["x"] } });
    expect(putTaxonomyOverrides).not.toHaveBeenCalled();
  });

  it("refuses canonical mutations in postgres mode when Neon is disabled", async () => {
    process.env.SIOONA_STATE_MODE = "postgres";
    process.env.SIOONA_TAXONOMY_NEON = "0";
    await expect(
      syncTaxonomyOverridesToBackend("tenant_a", { lead: { phrases: ["x"] } })
    ).rejects.toThrow("Canonical taxonomy destination disabled; mutation refused.");
    expect(putTaxonomyOverrides).not.toHaveBeenCalled();
    delete process.env.SIOONA_STATE_MODE;
  });

  it("maps web overrides to the snake_case backend shape", async () => {
    process.env.SIOONA_TAXONOMY_NEON = "1";
    putTaxonomyOverrides.mockResolvedValue(undefined);

    await syncTaxonomyOverridesToBackend("tenant_a", {
      lead: { phrases: ["book a demo"] },
      retention: { keywords: ["cancel"], negativePhrases: ["cancel my order"] },
    });

    expect(putTaxonomyOverrides).toHaveBeenCalledWith("tenant_a", {
      lead: { phrases: ["book a demo"], keywords: [], negative_phrases: [] },
      retention: {
        phrases: [],
        keywords: ["cancel"],
        negative_phrases: ["cancel my order"],
      },
    });
  });

  it("wraps backend failures with a stable message", async () => {
    process.env.SIOONA_TAXONOMY_NEON = "1";
    putTaxonomyOverrides.mockRejectedValue(new Error("503"));
    await expect(syncTaxonomyOverridesToBackend("tenant_a", {})).rejects.toThrow(
      "Could not save taxonomy overrides to Neon. 503",
    );
  });
});

describe("taxonomyOverridesFromNeon", () => {
  it("returns null when disabled without calling the backend", async () => {
    expect(await taxonomyOverridesFromNeon("tenant_a")).toBeNull();
    expect(getTaxonomyOverrides).not.toHaveBeenCalled();
  });

  it("maps backend rows to web overrides and drops empty types", async () => {
    process.env.SIOONA_TAXONOMY_NEON = "1";
    getTaxonomyOverrides.mockResolvedValue({
      lead: { phrases: ["a"], keywords: [], negative_phrases: [] },
      retention: { phrases: [], keywords: [], negative_phrases: ["b"] },
      upsell: { phrases: [], keywords: [], negative_phrases: [] },
    });

    expect(await taxonomyOverridesFromNeon("tenant_a")).toEqual({
      lead: { phrases: ["a"] },
      retention: { negativePhrases: ["b"] },
    });
  });

  it("throws when the backend call fails", async () => {
    process.env.SIOONA_TAXONOMY_NEON = "1";
    getTaxonomyOverrides.mockRejectedValue(new Error("down"));
    await expect(taxonomyOverridesFromNeon("tenant_a")).rejects.toThrow(
      "Could not load taxonomy overrides from Neon. down",
    );
  });
});
