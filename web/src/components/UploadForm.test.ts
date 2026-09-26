import { describe, expect, it } from "vitest";
import {
  filesForIngest,
  uploadActiveFilePrompt,
  uploadPredictionSyncWarning,
} from "@/components/UploadForm";

describe("upload active file", () => {
  const files = [{ name: "week-1.csv" }, { name: "week-2.csv" }];

  it("names the active file and ingests only that file", () => {
    const first = filesForIngest(files, 0);
    expect(first.map((file) => file.name)).toEqual(["week-1.csv"]);
    expect(uploadActiveFilePrompt(files.length, first[0]?.name)).toEqual({
      heading: "Will ingest",
      detail: "week-1.csv",
    });

    const second = filesForIngest(files, 1);
    expect(second.map((file) => file.name)).toEqual(["week-2.csv"]);
    expect(uploadActiveFilePrompt(files.length, second[0]?.name)).toEqual({
      heading: "Will ingest",
      detail: "week-2.csv",
    });
  });

  it("keeps a single selected file on the existing prompt", () => {
    expect(filesForIngest([{ name: "only.csv" }], 0)).toEqual([
      { name: "only.csv" },
    ]);
    expect(uploadActiveFilePrompt(1, "only.csv")).toEqual({
      heading: "File selected",
      detail: "only.csv",
    });
    expect(uploadActiveFilePrompt(0, null)).toEqual({
      heading: "Choose a file or drop it here",
      detail: "CSV, JSON, or WhatsApp .txt…",
    });
  });
});

describe("upload prediction sync warning", () => {
  it("says those reviews will not count on Eval when syncFailed is set", () => {
    const warning = uploadPredictionSyncWarning(2);
    expect(warning).toContain(
      "Those reviews will not count on Eval until sync succeeds",
    );
    expect(warning).not.toMatch(/FastAPI|Neon|BACKEND_URL/);
  });

  it("stays quiet when syncFailed is unset", () => {
    expect(uploadPredictionSyncWarning(0)).toBeNull();
  });
});
