import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ReportUploadForm } from "./ReportUploadForm";
it("submits durable membership while preserving dates/privacy and replacing file scope", () => {
  const html = renderToStaticMarkup(React.createElement(ReportUploadForm, {
    query: "uploadId=u1&file=old.csv&scoreFrom=2026-10-01&scoreTo=2026-10-04&reveal=1",
    options: [{ id: "u1", label: "weekly.csv · 1 Oct 2026 UTC · 10 chats" }], unavailable: false,
  }));
  expect(html).toContain('method="get"');
  expect(html).toContain('name="uploadId"');
  expect(html).toContain('value="u1" selected=""');
  expect(html).toContain('name="scoreFrom" value="2026-10-01"');
  expect(html).toContain('name="scoreTo" value="2026-10-04"');
  expect(html).toContain('name="reveal" value="1"');
  expect(html).not.toContain('name="file"');
  expect(html).toContain('aria-describedby="report-upload-help"');
});
it("keeps an unavailable selected upload visible and offers current-corpus recovery", () => {
  const html = renderToStaticMarkup(React.createElement(ReportUploadForm, {
    query: "uploadId=retired", options: [], unavailable: true,
  }));
  expect(html).toContain('value="retired" selected=""');
  expect(html).toContain("Upload list unavailable");
  expect(html).toContain("All current conversations");
  expect(html).toContain('aria-live="polite"');
});
