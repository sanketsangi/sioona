import { expect, it } from "vitest";
import { uploadPreviewDetail } from "./upload-preview";
it("reports zero counts honestly and distinguishes preview from import", () => {
  expect(uploadPreviewDetail({ conversations: 0, messages: 0, mapping: "CSV columns", missingTimestampPolicy: "UTC fallback" })).toContain("0 conversations, 0 messages");
  expect(uploadPreviewDetail({ conversations: 1, messages: 2, mapping: "CSV columns", missingTimestampPolicy: "UTC fallback" })).toContain("Nothing imported");
});
it.each([null, {}, {conversations:-1,messages:2,mapping:"CSV",missingTimestampPolicy:"UTC"}, {conversations:1,messages:NaN,mapping:"CSV",missingTimestampPolicy:"UTC"}])("rejects malformed previews without suggesting an upload retry", value => {
  expect(() => uploadPreviewDetail(value)).toThrow(/file remains selected; retry Preview mapping/);
});
