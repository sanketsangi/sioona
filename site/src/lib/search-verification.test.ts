import { afterEach, describe, expect, it, vi } from "vitest";
import { searchVerification, indexNowKey } from "./search-verification";
import { GET } from "@/app/indexnow-key.txt/route";
import { markdownDocument } from "./markdown-pages";

afterEach(() => vi.unstubAllEnvs());

describe("optional search ownership configuration", () => {
  it("emits no placeholders when accounts are not configured", () => {
    expect(searchVerification({})).toEqual({});
    expect(indexNowKey({})).toBeNull();
  });
  it("maps public verification codes without exposing API credentials", () => {
    expect(searchVerification({ GOOGLE_SITE_VERIFICATION: " google_fixture_code ", BING_SITE_VERIFICATION: "bing_fixture_code", AHREFS_SITE_VERIFICATION: "ahrefs_fixture_code", GOOGLE_API_KEY: "never-render" })).toEqual({ google: "google_fixture_code", other: { "msvalidate.01": "bing_fixture_code", "ahrefs-site-verification": "ahrefs_fixture_code" } });
  });
  it("rejects malformed configured values rather than publishing invalid ownership", () => {
    for (const value of ["<meta>injected", "has spaces", "x".repeat(257)]) expect(() => searchVerification({ GOOGLE_SITE_VERIFICATION: value })).toThrow();
    for (const value of ["short", "bad_key_under_score", "x".repeat(129)]) expect(() => indexNowKey({ INDEXNOW_KEY: value })).toThrow();
  });
  it("serves only the configured key as plain text, without caching or indexing", async () => {
    vi.stubEnv("INDEXNOW_KEY", "");
    expect(GET().status).toBe(404);
    vi.stubEnv("INDEXNOW_KEY", "synthetic-indexnow-key-1234");
    const response = GET();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("synthetic-indexnow-key-1234");
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(markdownDocument("/indexnow-key.txt", "text/markdown")).toBeNull();
  });
});
