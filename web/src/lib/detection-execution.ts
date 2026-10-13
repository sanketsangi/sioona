import { getStateMode } from "./state-mode";
export function detectionExecution(): "inline" | "worker" {
  const mode = process.env.SIOONA_DETECTION_EXECUTION?.trim() || "inline";
  if (mode !== "inline" && mode !== "worker") throw new Error("Invalid detection execution mode");
  if (mode === "worker" && getStateMode() !== "postgres") throw new Error("Worker execution requires canonical Postgres state");
  return mode;
}
export function assertInlineDetection(): void {
  if (detectionExecution() === "worker") throw new Error("Detection is handled by the background worker");
}
