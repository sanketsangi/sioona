import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import Page from "./page";

afterEach(() => vi.unstubAllEnvs());

it("publishes only supplied retention and database region and offers a separate recovery mailbox", () => {
  vi.stubEnv("PILOT_CONTACT_SUPPORT_EMAIL", "help@example.test");
  vi.stubEnv("PILOT_CONTACT_RETENTION", "Synthetic approved retention text");
  vi.stubEnv("PILOT_CONTACT_HOSTING_REGION", "synthetic-database-region");
  const html = renderToStaticMarkup(createElement(Page));
  expect(html).toContain("Synthetic approved retention text");
  expect(html).toContain("synthetic-database-region");
  expect(html).toContain("mailto:help%40example.test");
  expect(html).not.toContain("not published yet");
});

it("keeps missing policy facts explicit and invents no email", () => {
  for (const key of ["PILOT_CONTACT_SUPPORT_EMAIL", "PILOT_CONTACT_RETENTION", "PILOT_CONTACT_HOSTING_REGION"]) vi.stubEnv(key, "");
  const html = renderToStaticMarkup(createElement(Page));
  expect(html).toContain("retention period is not published yet");
  expect(html).toContain("hosting region is not published yet");
  expect(html).not.toContain("mailto:");
});
