import { describe, expect, it } from "vitest";
import { initialsFromName } from "./format";

describe("initialsFromName", () => {
  it("takes first + last initials for multi-word names", () => {
    expect(initialsFromName("Neha Singh")).toBe("NS");
    expect(initialsFromName("Asha Mehta")).toBe("AM");
  });

  it("uses a single letter for one-word names", () => {
    expect(initialsFromName("Neha")).toBe("N");
  });

  it("ignores punctuation and extra whitespace", () => {
    expect(initialsFromName("  Neha-Singh  ")).toBe("NS");
    expect(initialsFromName("O'Brien")).toBe("OB");
  });

  it("returns ? for missing or empty names", () => {
    expect(initialsFromName()).toBe("?");
    expect(initialsFromName("")).toBe("?");
    expect(initialsFromName("   ")).toBe("?");
    expect(initialsFromName("!!!")).toBe("?");
  });
});
