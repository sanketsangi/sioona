import { signalTypeLabel, signalTypeMarkClass } from "@/lib/format";
import type { SignalType } from "@/lib/types";

export function SignalBadge({ type }: { type: SignalType }) {
  return (
    <span
      className={`inline-flex h-5 items-center rounded-sm px-1.5 text-label-12 font-medium ${signalTypeMarkClass(type)}`}
    >
      {signalTypeLabel(type)}
    </span>
  );
}
