/**
 * @param {unknown} sync
 * @returns {number | null}
 */
function failedCount(sync) {
  if (!sync || typeof sync !== "object" || !("failed" in sync)) return null;
  const failed = /** @type {{ failed?: unknown }} */ (sync).failed;
  return typeof failed === "number" && Number.isFinite(failed) ? failed : null;
}

/**
 * Why an ingest response did not publish every chat and signal.
 * HTTP 200 with a non-zero failure count or `syncError` is still a failure.
 *
 * @param {number} status
 * @param {unknown} body
 * @returns {string | null}
 */
export function ingestPublicationError(status, body) {
  if (status !== 200) return `ingest HTTP ${status}`;
  if (!body || typeof body !== "object") return "ingest response is missing";
  const record = /** @type {Record<string, unknown>} */ (body);
  const predictionFailed = failedCount(record.predictionSync);
  const conversationFailed = failedCount(record.conversationSync);
  if (predictionFailed == null || conversationFailed == null) {
    return "ingest response is missing predictionSync.failed or conversationSync.failed";
  }
  const syncError = typeof record.syncError === "string" ? record.syncError.trim() : "";
  if (predictionFailed > 0 || conversationFailed > 0 || syncError) {
    return (
      syncError ||
      `predictionSync.failed=${predictionFailed} conversationSync.failed=${conversationFailed}`
    );
  }
  return null;
}
