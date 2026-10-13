import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("llms.txt", () => {
  it("includes agent instructions and the about page", async () => {
    const response = GET();
    expect(response.headers.get("content-type")).toContain("text/plain");
    const body = await response.text();
    expect(body).toContain("## Instructions");
    expect(body).toContain("Accept: text/markdown");
    expect(body).toContain("Vary: Accept");
    expect(body).toContain("/about");
    expect(body).toContain("/sitemap.xml");
    expect(body).toContain("/llms.txt");
    expect(body).toContain("404");
  });
});
