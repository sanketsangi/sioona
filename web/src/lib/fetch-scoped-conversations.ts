import { getConversations, type BackendConversation } from "./backend-client";

/** Bound query-string and database keep-set size without dropping any membership. */
export async function fetchScopedConversations(tenantId: string, ids: string[], options?: {
  timeoutMs?: number; updatedSince?: string;
}): Promise<BackendConversation[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  const rows: BackendConversation[] = [];
  for (let offset = 0; offset < unique.length; offset += 50) {
    const batch = await getConversations(tenantId, {
      ...options, conversationIds: unique.slice(offset, offset + 50),
    });
    if (!Array.isArray(batch)) throw new Error("Invalid scoped conversation response");
    rows.push(...batch);
  }
  return rows;
}
