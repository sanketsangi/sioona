export const INSIGHTS_SHADOW_TIP_STORAGE_KEY =
  "sioona.insights.shadowTip.dismissed";

export const INSIGHTS_SHADOW_TIP_COPY =
  "Shadow Mode — Confirm or correct detections. Replies are drafts only; nothing is sent.";

/** True when localStorage already holds a dismiss for this tip. */
export function isInsightsShadowTipDismissed(
  getItem: (key: string) => string | null,
): boolean {
  try {
    return getItem(INSIGHTS_SHADOW_TIP_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Persist dismiss so the tip does not re-show on later visits. */
export function persistInsightsShadowTipDismissed(
  setItem: (key: string, value: string) => void,
): void {
  try {
    setItem(INSIGHTS_SHADOW_TIP_STORAGE_KEY, "1");
  } catch {
    /* ignore quota / private mode */
  }
}
