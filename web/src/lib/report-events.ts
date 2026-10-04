import type { Signal } from "./types";

/** Event windows use review/outcome timestamps, independent of detection age. */
export function scopeReportEvents(signals: Signal[], from: string, to?: string): Signal[] {
  const start = Date.parse(from);
  const end = to ? Date.parse(to) : Infinity;
  const within = (value?: string) => {
    const instant = value ? Date.parse(value) : NaN;
    return Number.isFinite(instant) && instant >= start && instant <= end;
  };
  return signals.map((signal) => ({ ...signal,
    feedback: within(signal.feedback?.reviewedAt) ? signal.feedback : undefined,
    outcome: within(signal.outcome?.recordedAt) ? signal.outcome : undefined,
  }));
}
