import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readStore, resetStore, writeStore } from "./store";

function storeDir(): string {
  const worker =
    process.env.VITEST_POOL_ID ?? process.env.VITEST_WORKER_ID ?? "0";
  return path.join(os.tmpdir(), `sioona-store-vitest-${worker}`);
}

async function tmpFiles(): Promise<string[]> {
  const entries = await fs.readdir(storeDir());
  return entries.filter((name) => name.endsWith(".tmp"));
}

describe("writeStore atomicity", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("round-trips and leaves no temp files behind", async () => {
    const seeded = await resetStore();
    seeded.pilot = { ...seeded.pilot, baselineNote: "atomic-write-check" };
    await writeStore(seeded);

    expect((await readStore()).pilot.baselineNote).toBe("atomic-write-check");
    expect(await tmpFiles()).toEqual([]);
  });

  it("keeps the previous file intact and cleans up when the write fails", async () => {
    const seeded = await resetStore();
    seeded.pilot = { ...seeded.pilot, baselineNote: "before" };
    await writeStore(seeded);

    vi.spyOn(fs, "rename").mockImplementationOnce(async () => {
      throw new Error("EXDEV");
    });
    seeded.pilot = { ...seeded.pilot, baselineNote: "after" };
    await writeStore(seeded);
    vi.restoreAllMocks();

    expect(await tmpFiles()).toEqual([]);
    const onDisk = JSON.parse(
      await fs.readFile(path.join(storeDir(), "store.json"), "utf8"),
    ) as { pilot: { baselineNote?: string } };
    expect(onDisk.pilot.baselineNote).toBe("before");
  });
});
