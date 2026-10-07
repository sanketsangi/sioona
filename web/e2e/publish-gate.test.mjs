import assert from "node:assert/strict";
import { test } from "node:test";

import { ingestPublicationError } from "./ingest-publication.mjs";

const clean = {
  predictionSync: { attempted: 4, created: 4, updated: 0, failed: 0, skipped: 0 },
  conversationSync: { attempted: 4, created: 0, updated: 4, failed: 0, skipped: 0 },
};

test("HTTP 200 with failed prediction publication is a failure", () => {
  const error = ingestPublicationError(200, {
    ...clean,
    predictionSync: { ...clean.predictionSync, failed: 31 },
  });
  assert.equal(error, "predictionSync.failed=31 conversationSync.failed=0");
});

test("HTTP 200 with a conversation sync failure is a failure", () => {
  const error = ingestPublicationError(200, {
    ...clean,
    conversationSync: { ...clean.conversationSync, failed: 2 },
  });
  assert.equal(error, "predictionSync.failed=0 conversationSync.failed=2");
});

test("HTTP 200 with syncError is a failure even when counts are zero", () => {
  const error = ingestPublicationError(200, {
    ...clean,
    syncError: "Neon did not store every chat or signal. The file is saved locally — retry the upload.",
  });
  assert.match(error ?? "", /Neon did not store every chat or signal/);
});

test("a complete HTTP 200 publication has no error", () => {
  assert.equal(ingestPublicationError(200, clean), null);
});
