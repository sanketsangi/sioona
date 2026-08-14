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
  conversationIds?: string[]
): Promise<BackendSignalScore | null> {
  try {
    return await getSignalScore(
      tenantId,
      conversationIds !== undefined ? { conversationIds } : undefined
    );
  } catch {
    return null;
  }
}
