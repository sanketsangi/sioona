import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getStateMode,
  assertValidStateModeAtBoot,
  ProductionRefusesJsonDemoError,
} from "./state-mode";

describe("state-mode (CB-10)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.SIOONA_STATE_MODE;
    delete process.env.SIOONA_ENV;
    delete process.env.VERCEL_ENV;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("defaults to json-demo in non-production environments when unset", () => {
    expect(getStateMode()).toBe("json-demo");
    expect(assertValidStateModeAtBoot()).toBe("json-demo");
  });

  it("returns postgres when explicitly configured in non-production", () => {
    process.env.SIOONA_STATE_MODE = "postgres";
    expect(getStateMode()).toBe("postgres");
  });

  it("handles case and whitespace in SIOONA_STATE_MODE", () => {
    process.env.SIOONA_STATE_MODE = "  POSTGRES  ";
    expect(getStateMode()).toBe("postgres");

    process.env.SIOONA_STATE_MODE = "  JSON-DEMO  ";
    expect(getStateMode()).toBe("json-demo");
  });

  it("defaults to postgres in production environment (SIOONA_ENV=production)", () => {
    process.env.SIOONA_ENV = "production";
    expect(getStateMode()).toBe("postgres");
    expect(assertValidStateModeAtBoot()).toBe("postgres");
  });

  it("defaults to postgres in production environment (VERCEL_ENV=production)", () => {
    process.env.VERCEL_ENV = "production";
    expect(getStateMode()).toBe("postgres");
    expect(assertValidStateModeAtBoot()).toBe("postgres");
  });

  it("refuses json-demo in production (SIOONA_ENV=production)", () => {
    process.env.SIOONA_ENV = "production";
    process.env.SIOONA_STATE_MODE = "json-demo";
    expect(() => getStateMode()).toThrow(ProductionRefusesJsonDemoError);
    expect(() => assertValidStateModeAtBoot()).toThrow(
      ProductionRefusesJsonDemoError
    );
  });

  it("refuses json-demo in production (VERCEL_ENV=production)", () => {
    process.env.VERCEL_ENV = "production";
    process.env.SIOONA_STATE_MODE = "json-demo";
    expect(() => getStateMode()).toThrow(ProductionRefusesJsonDemoError);
    expect(() => assertValidStateModeAtBoot()).toThrow(
      ProductionRefusesJsonDemoError
    );
  });

  it("rejects unknown state modes", () => {
    process.env.SIOONA_STATE_MODE = "sqlite";
    expect(() => getStateMode()).toThrow(/Invalid SIOONA_STATE_MODE/);
  });
});
