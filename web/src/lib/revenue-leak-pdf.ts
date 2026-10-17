/**
 * Single-document PDF for the revenue leak report.
 * Helvetica only, so rupee amounts are written as "INR …".
 */

import { reportExplanation } from "./report-explanation";

import {
  formatInrAscii,
  precisionLabel,
  type RevenueLeakReport,
} from "@/lib/revenue-leak";

function pdfEscape(text: string): string {
  const latin = text.replace(/[^\x20-\x7E]/g, "?");
  return latin.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current && current.length + 1 + word.length > width) {
      lines.push(current);
      current = "";
    }
    let remainder = word;
    while (remainder.length > width) {
      lines.push(remainder.slice(0, width));
      remainder = remainder.slice(width);
    }
    current = current ? `${current} ${remainder}` : remainder;
  }
  if (current) lines.push(current);
  return lines;
}

export function revenueLeakPdfLines(report: RevenueLeakReport): string[] {
  const lines: string[] = [
    "Sioona revenue leak report",
    report.anonymised
      ? "Anonymised. Customer ids are pseudonyms."
      : "Named copy. Do not forward outside the team.",
    `Window: ${report.windowLabel}`,
    report.dataLabel ?? "Data provenance unverified; customer impact unverified.",
  ];
  if (report.fileLabel) lines.push(`Pilot file: ${report.fileLabel}`);
  lines.push(
    "",
    ...reportExplanation(report),
    "Signal counts: selected corpus. Reviews and outcomes: UTC date range.",
    `Retention ${report.counts.retention}   Lead ${report.counts.lead}   Upsell ${report.counts.upsell}`,
    `Outcomes  Saved ${report.outcomes.saved}   Lost ${report.outcomes.lost}   Converted ${report.outcomes.converted}`,
    "Exposure categories: retention conversations; estimates, not confirmed revenue.",
    `Asset exposure estimate ${formatInrAscii(report.exposure.assetInr)}`,
    `Revenue opportunity estimate ${formatInrAscii(report.exposure.revenueOpportunityInr)}`,
    `Unconfirmed value ${formatInrAscii(report.exposure.unconfirmedInr)}`,
    `Reviewer-recorded value ${formatInrAscii(report.exposure.reviewerRecordedInr)}`,
    `Confirmed saved (reviewer-recorded) ${report.revenueVerified === false ? "unavailable" : formatInrAscii(report.inrSaved)}`,
    `Persisted reviews ${report.reviewsAvailable === false ? "unavailable" : report.precision.reviewed}`,
    "Precision denominator: all reviews, including partially correct; not total chats.",
    `SignalScore precision ${report.reviewsAvailable === false ? "unavailable" : precisionLabel(report.precision.score, report.precision.reviewed)}`,
    "",
    "Customers at risk",
  );
  if (report.customersAtRisk.length === 0) {
    lines.push("No retention signals in this pilot file.");
  }
  for (const row of report.customersAtRisk) {
    const value = row.valueInr == null ? "Not stated" : formatInrAscii(row.valueInr);
    const when = row.timeframe ? ` (${row.timeframe})` : "";
    const outcome = row.outcome ? `  Outcome: ${row.outcome}` : "";
    lines.push(
      `${row.customerLabel}  ${row.urgency}${when}  ${value}${row.valueProvenance ? ` (${row.valueProvenance})` : ""}${outcome}`,
      row.quote ? `"${row.quote}"` : "Customer quote unavailable",
      ""
    );
  }
  lines.push("Shadow Mode. Nothing in this report was sent to a customer.");
  return lines;
}

/** Build a PDF. Short pilots fit on one sheet; longer ones continue. */
export function buildRevenueLeakPdf(report: RevenueLeakReport): Uint8Array {
  const wrapped = revenueLeakPdfLines(report).flatMap((line) => wrap(line, 48));
  const pageSize = 42;
  const pages: string[][] = [];
  for (let i = 0; i < wrapped.length; i += pageSize) {
    pages.push(wrapped.slice(i, i + pageSize));
  }
  if (pages.length === 0) pages.push(["Sioona revenue leak report"]);

  const byId = new Map<number, string>();
  const pageIds: number[] = [];
  let nextId = 3;

  for (const pageLines of pages) {
    const contentId = nextId++;
    const pageId = nextId++;
    pageIds.push(pageId);
    const commands = ["BT", "/F1 11 Tf", "14 TL", "50 780 Td"];
    for (const line of pageLines) {
      commands.push(`(${pdfEscape(line)}) Tj`, "T*");
    }
    commands.push("ET");
    const stream = commands.join("\n");
    byId.set(
      contentId,
      `${contentId} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`
    );
    byId.set(
      pageId,
      `${pageId} 0 obj\n<< /Type /Page /Parent 1 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 2 0 R >> >> >>\nendobj\n`
    );
  }

  const kids = pageIds.map((id) => `${id} 0 R`).join(" ");
  const catalogId = nextId;
  byId.set(
    1,
    `1 0 obj\n<< /Type /Pages /Count ${pageIds.length} /Kids [${kids}] >>\nendobj\n`
  );
  byId.set(
    2,
    "2 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
  );
  byId.set(
    catalogId,
    `${catalogId} 0 obj\n<< /Type /Catalog /Pages 1 0 R >>\nendobj\n`
  );

  const maxId = catalogId;
  let assembled = "%PDF-1.4\n";
  const xrefOffsets = new Array<number>(maxId + 1).fill(0);
  for (let id = 1; id <= maxId; id++) {
    const chunk = byId.get(id);
    if (!chunk) continue;
    xrefOffsets[id] = assembled.length;
    assembled += chunk;
  }
  const xrefStart = assembled.length;
  let xref = `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxId; id++) {
    xref += `${String(xrefOffsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${maxId + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return new TextEncoder().encode(assembled + xref + trailer);
}
