/** Durable publication has already succeeded. Secondary failures must not invite reimport. */
export async function finalizePublishedUpload(effects: {
  cache: () => Promise<unknown>;
  pilot: () => Promise<unknown>;
}): Promise<string[]> {
  const results = await Promise.allSettled([Promise.resolve().then(effects.cache), Promise.resolve().then(effects.pilot)]);
  return results.flatMap((result, index) => result.status === "fulfilled" ? [] : [
    index === 0
      ? "Upload stored. This instance could not refresh its cache; reload to restore the published data."
      : "Upload stored. Pilot settings could not refresh; the published upload remains available.",
  ]);
}
