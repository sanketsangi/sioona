export type KnownUploadJob = { id: string; file: string };
export function knownUploadJob(params: URLSearchParams): KnownUploadJob | null {
  const id = params.get("uploadJob");
  const file = params.get("uploadFile")?.trim();
  return id && /^[A-Za-z0-9_-]{1,64}$/.test(id) && file && file.length <= 255 && !/[\\/\u0000-\u001f]/.test(file) ? { id, file } : null;
}
export async function resumeUploadJob(job: KnownUploadJob, signal: AbortSignal, request: typeof fetch = fetch): Promise<{ status: string; completed_conversations: number; conversation_count: number }> {
  const lostConnection = "Progress connection lost. Resume checking this upload; do not upload it again.";
  let response: Response;
  try {
    response = await request(`/api/jobs/${encodeURIComponent(job.id)}`, { method: "GET", cache: "no-store", signal });
  } catch (error) {
    if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
    throw new Error(lostConnection);
  }
  if (!response.ok) throw new Error(response.status === 401 ? "Your session expired. Sign in again to check this upload." : response.status === 403 || response.status === 404 ? "This upload is unavailable for the signed-in workspace. Check your account before trying again." : "Progress connection lost. Resume checking this upload; do not upload it again.");
  let result;
  try { result = await response.json(); } catch { throw new Error("Upload progress response was invalid. Resume checking this upload; do not upload it again."); }
  const validCount = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0;
  if (!result || !["queued", "leased", "running", "failed", "succeeded", "cancelled", "dead_lettered"].includes(result.status) ||
    !validCount(result.completed_conversations) || !validCount(result.conversation_count) || result.completed_conversations > result.conversation_count) {
    throw new Error("Upload progress response was invalid. Resume checking this upload; do not upload it again.");
  }
  return result;
}

export function uploadJobProgress(result: { status: string; completed_conversations?: number; conversation_count?: number }): string {
  const stage = result.status === "failed" ? "retrying" : ["running", "leased"].includes(result.status) ? "processing" : "queued";
  const completed = result.completed_conversations;
  const total = result.conversation_count;
  const counts = typeof completed === "number" && typeof total === "number" && Number.isInteger(completed) && Number.isInteger(total) && completed >= 0 && total > 0 && completed <= total;
  return `Detection ${stage}…${counts ? ` ${Intl.NumberFormat().format(completed)} of ${Intl.NumberFormat().format(total)} conversations processed.` : ""}`;
}
