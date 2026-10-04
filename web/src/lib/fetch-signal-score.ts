/**
 * Best-effort fetch of FastAPI SignalScore for RSC / API routes.
 * Returns null when the backend is unreachable so UI can fall back to JSON.
 */

import {
  getSignalScore,
  type BackendSignalScore,
} from "./backend-client";

export async function fetchSignalScoreSafe(
  tenantId: string,
  conversationIds?: string[],
  dateRange?: {
    dateFrom?: string;
    dateTo?: string;
    uploadId?: string;
  }
): Promise<BackendSignalScore | null> {
  try {
    const opts: {
      conversationIds?: string[];
      date_from?: string;
      date_to?: string;
      upload_id?: string;
    } = {};
    if (conversationIds !== undefined) {
      opts.conversationIds = conversationIds;
    }
    if (dateRange?.uploadId) opts.upload_id = dateRange.uploadId;
    if (dateRange?.dateFrom) opts.date_from = dateRange.dateFrom;
    if (dateRange?.dateTo) opts.date_to = dateRange.dateTo;
    return await getSignalScore(
      tenantId,
      Object.keys(opts).length > 0 ? opts : undefined
    );
  } catch {
    return null;
  }
}
