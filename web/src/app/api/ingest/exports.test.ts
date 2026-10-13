import { afterEach, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { POST } from "./route";
import * as store from "@/lib/store";
import * as publication from "@/lib/publish-atomic-ingest";
import * as ledger from "@/lib/ai/run-with-ledger";
vi.mock("@/lib/auth-guard", () => ({ requireApiSession: vi.fn(async () => ({ tenantId: "tenant_partner", role: "admin" })) }));
vi.mock("@/lib/ai/run-with-ledger", () => ({ runHybridDetectionWithLedger: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function request(files: File[], preview = false) {
  const form = new FormData(); for (const file of files) form.append("file", file);
  if (preview) form.append("preview", "true");
  return new Request("http://localhost/api/ingest", { method: "POST", body: form });
}
function guards() {
  const read = vi.spyOn(store, "readStore").mockRejectedValue(new Error("Store must not be read"));
  const write = vi.spyOn(store, "writeStore").mockRejectedValue(new Error("Store must not be written"));
  const publish = vi.spyOn(publication, "publishAtomicIngest").mockRejectedValue(new Error("Must not publish"));
  const fetch = vi.fn().mockRejectedValue(new Error("Must not use network")); vi.stubGlobal("fetch", fetch);
  return () => { expect(read).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled(); expect(publish).not.toHaveBeenCalled(); expect(ledger.runHybridDetectionWithLedger).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled(); };
}
async function xlsxFile(bad = false) {
  const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet("Synthetic");
  sheet.addRows([["conversation_id", "role", "content", "customer_name"], ["a", "customer", "Priya Sharma हिंदी ₹500", "Priya Sharma"]]);
  if (bad) sheet.addRow(["b", "customer", "", "Asha Mehta"]);
  return new File([new Uint8Array(await book.xlsx.writeBuffer())], "synthetic.xlsx");
}
it("previews mapping and counts with no writes, LLM calls, network or raw transcript", async () => {
  const check = guards(); const response = await POST(request([await xlsxFile()], true));
  expect(response.status).toBe(200); const data = await response.json();
  expect(data.previews[0]).toMatchObject({ format: "sioona_xlsx", conversations: 1, messages: 1 });
  expect(data.previews[0].mapping).toContain("conversation_id"); expect(JSON.stringify(data)).not.toMatch(/Priya|₹500/); check();
});
it("rejects a valid file followed by a corrupted archive before any side effects", async () => {
  const check = guards(); const response = await POST(request([await xlsxFile(), new File(["broken"], "broken.xlsx")]));
  expect(response.status).toBe(400); expect((await response.json()).error).toContain("Nothing was imported"); check();
});
it("rejects a bad later row with a location and no customer content", async () => {
  const check = guards(); const response = await POST(request([await xlsxFile(true)]));
  expect(response.status).toBe(400); expect((await response.json()).error).toContain("Sheet 1, row 3"); check();
});
it("rejects excess aggregate upload size before reading store", async () => {
  const check = guards(); const response = await POST(request([new File([new Uint8Array(6 * 1024 * 1024)], "one.xlsx"), new File([new Uint8Array(6 * 1024 * 1024)], "two.xlsx")]));
  expect(response.status).toBe(400); check();
});
it("rejects excess file count before reading store", async () => {
  const check = guards(); const response = await POST(request(Array.from({ length: 17 }, () => new File(["x"], "one.eml"))));
  expect(response.status).toBe(400); check();
});
