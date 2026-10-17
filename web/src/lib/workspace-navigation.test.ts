import { describe, expect, it } from "vitest";
import { workspaceViewHref, corpusSwitchHref } from "./workspace-navigation";

describe("workspace navigation", () => {
  it("keeps corpus and review context through screen navigation", () => {
    const query = new URLSearchParams("view=insights&file=week.csv&status=new&type=retention&preview=sig1&page=3&q=close&mode=action");
    const evaluation = new URL(workspaceViewHref("eval", query), "http://local");
    expect(evaluation.searchParams.get("file")).toBe("week.csv");
    expect(evaluation.searchParams.get("preview")).toBe("sig1");
    expect(evaluation.searchParams.get("page")).toBe("3");
    expect(evaluation.searchParams.get("view")).toBe("eval");
    expect(evaluation.searchParams.get("type")).toBe("retention");
  });
  it("clears selection and page when switching corpus, preserving valid filters", () => {
    const result = new URL(corpusSwitchHref("next.csv", new URLSearchParams("preview=old&page=8&type=lead&status=new&q=hello&mode=action")), "http://local");
    expect(result.searchParams.get("file")).toBe("next.csv");
    expect(result.searchParams.has("preview")).toBe(false);
    expect(result.searchParams.has("page")).toBe(false);
    expect(result.searchParams.get("type")).toBe("lead");
    expect(result.searchParams.get("scopeChanged")).toBe("1");
  });
});

it("carries return context through dedicated administration routes", () => {
  const params = new URLSearchParams("file=week.csv&preview=sig1&page=2");
  expect(new URL(workspaceViewHref("economics", params), "http://local").searchParams.get("file")).toBe("week.csv");
  expect(new URL(workspaceViewHref("lifecycle", params), "http://local").searchParams.get("preview")).toBe("sig1");
});
