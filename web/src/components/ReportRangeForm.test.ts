import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ReportRangeForm } from "./ReportRangeForm";
it("keeps file, privacy and date bounds in a native report GET form", () => {
  const html = renderToStaticMarkup(React.createElement(ReportRangeForm, { query: "file=one.csv&reveal=1&scoreFrom=2026-10-01T00%3A00%3A00Z&scoreTo=2026-10-04T23%3A59%3A59Z" }));
  expect(html).toContain('method="get"');
  expect(html).toContain('name="file" value="one.csv"');
  expect(html).toContain('name="reveal" value="1"');
  expect(html).toContain('value="2026-10-01"');
  expect(html).toContain('value="2026-10-04"');
  expect(html).toContain('type="submit"');
});

it("associates the server range error with the focused end-date input", () => {
  const html = renderToStaticMarkup(React.createElement(ReportRangeForm, {
    query: "scoreFrom=2026-10-04&scoreTo=2026-10-01", error: "Report end date precedes its start",
  }));
  expect(html).toContain('aria-invalid="true"');
  expect(html).toContain('aria-describedby="report-end-error"');
  expect(html).toContain('aria-live="polite"');
  expect(html).toContain("Choose an end date on or after the start");
});

it("places a start-date error beside the start input", () => {
  const html = renderToStaticMarkup(React.createElement(ReportRangeForm, {
    query: "scoreFrom=bad", error: "Invalid report start date", errorField: "scoreFrom",
  }));
  expect(html).toContain('aria-describedby="report-start-error"');
  expect(html).not.toContain('aria-describedby="report-end-error"');
  expect(html).toContain("Choose a valid start date");
});
