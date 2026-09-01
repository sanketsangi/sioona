"use client";

import { useRouter } from "next/navigation";
import {
  useId,
  useState,
  useTransition,
  type ComponentType,
} from "react";
import { ButtonSpinner } from "@/components/ButtonSpinner";
import { evalCardClassName, evalCardPadClassName } from "@/components/EvalCard";
import { InsightsReviewPaneHeader } from "@/components/InsightsReviewPaneHeader";
import { InsightsReviewStatusChip } from "@/components/InsightsReviewStatusChip";
import { LeadIcon } from "@/components/icons/LeadIcon";
import { RetentionIcon } from "@/components/icons/RetentionIcon";
import { StopIcon } from "@/components/icons/StopIcon";
import { UpsellIcon } from "@/components/icons/UpsellIcon";
import { Card, CardContent } from "@/components/ui/card";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import type { SignalType } from "@/lib/types";
import { cn } from "@/lib/utils";

type GroundTruthValue = SignalType | "none" | "";

/** ToggleGroup values cannot be empty string — map Unset ↔ unset. */
type ToggleValue = "unset" | SignalType | "none";

const OPTIONS: Array<{
  value: GroundTruthValue;
  toggleValue: ToggleValue;
  label: string;
  hint: string;
  Icon?: ComponentType<{ className?: string; "data-icon"?: string }>;
}> = [
  {
    value: "",
    toggleValue: "unset",
    label: "Unset",
    hint: "No ground truth label",
  },
  {
    value: "lead",
    toggleValue: "lead",
    label: "Lead",
    hint: "Labeled as Lead",
    Icon: LeadIcon,
  },
  {
    value: "retention",
    toggleValue: "retention",
    label: "Retention",
    hint: "Labeled as Retention",
    Icon: RetentionIcon,
  },
  {
    value: "upsell",
    toggleValue: "upsell",
    label: "Upsell",
    hint: "Labeled as Upsell",
    Icon: UpsellIcon,
  },
  {
    value: "none",
    toggleValue: "none",
    label: "None",
    hint: "Explicitly no signal",
    Icon: StopIcon,
  },
];

/** Class literals live here so Tailwind content scan picks them up (not only via lib/). */
const STATUS_CHIP: Record<GroundTruthValue, string> = {
  "": "bg-sio-bg-muted text-sio-fg-muted",
  none: "bg-sio-bg-interactive-hover text-sio-fg-base",
  lead: "bg-sio-signal-lead-bg text-sio-signal-lead-fg",
  retention: "bg-sio-signal-retention-bg text-sio-signal-retention-fg",
  upsell: "bg-sio-signal-upsell-bg text-sio-signal-upsell-fg",
};

/**
 * Match FeedbackControls size="lg" Button chrome (C/I/P). 5 equal columns
 * span the card like the 3-col feedback row; wrap to 3+2 on a narrow rail.
 */
const itemLayout =
  "inline-flex h-9 min-h-11 min-w-0 w-full items-center justify-center gap-1.5 rounded-lg px-2.5 text-sm font-medium touch-manipulation md:min-h-9";
const outlineItem =
  "border-sio-border-subtle bg-sio-bg-base text-sio-fg-base hover:border-sio-border-strong hover:bg-sio-bg-interactive";
const selectedItem =
  "data-[state=on]:border-transparent data-[state=on]:bg-sio-bg-inverse data-[state=on]:text-sio-fg-on-color data-[state=on]:hover:border-transparent data-[state=on]:hover:bg-sio-bg-inverse/90";

function statusLabel(value: GroundTruthValue): string {
  return OPTIONS.find((o) => o.value === value)?.label ?? "Unset";
}

function toToggleValue(value: GroundTruthValue): ToggleValue {
  return value === "" ? "unset" : value;
}

function fromToggleValue(value: ToggleValue): GroundTruthValue {
  return value === "unset" ? "" : value;
}

export function GroundTruthControl({
  conversationId,
  groundTruth,
  className,
}: {
  conversationId: string;
  groundTruth?: SignalType | "none";
  className?: string;
}) {
  const router = useRouter();
  const headingId = useId();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState<GroundTruthValue>(groundTruth ?? "");
  const [prevGroundTruth, setPrevGroundTruth] = useState(groundTruth);
  const [error, setError] = useState<string | null>(null);

  if (groundTruth !== prevGroundTruth) {
    setPrevGroundTruth(groundTruth);
    setValue(groundTruth ?? "");
  }

  async function onSelect(next: GroundTruthValue) {
    if (next === value || pending) return;
    const previous = value;
    setValue(next);
    setError(null);
    try {
      const res = await fetch(
        `/api/conversations/${conversationId}/ground-truth`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            groundTruth: next === "" ? null : next,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save ground truth");
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setValue(previous);
      setError(
        err instanceof Error ? err.message : "Failed to save ground truth",
      );
    }
  }

  return (
    <Card
      size="sm"
      className={cn("insights-review-pane", evalCardClassName, className)}
      aria-labelledby={headingId}
    >
      <InsightsReviewPaneHeader id={headingId} title="Ground Truth">
        <InsightsReviewStatusChip className={STATUS_CHIP[value]}>
          {statusLabel(value)}
        </InsightsReviewStatusChip>
      </InsightsReviewPaneHeader>

      <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col px-0">
        <div
          className={cn(
            evalCardPadClassName,
            "flex min-h-0 flex-1 flex-col gap-2.5 py-3",
          )}
        >
          <p className="text-label-12 text-sio-fg-muted">
            Label this conversation so Eval can compute labeled precision and
            recall for Lead, Retention, Upsell, or None.
          </p>

          <ToggleGroup
            type="single"
            variant="outline"
            size="lg"
            spacing={2}
            value={toToggleValue(value)}
            onValueChange={(next) => {
              if (!next || pending) return;
              void onSelect(fromToggleValue(next as ToggleValue));
            }}
            disabled={pending}
            aria-labelledby={headingId}
            className="grid w-full min-w-0 grid-cols-5 gap-2 max-[420px]:grid-cols-3"
          >
            {OPTIONS.map((opt) => {
              const selected = value === opt.value;
              const { Icon } = opt;
              return (
                <ToggleGroupItem
                  key={opt.label}
                  value={opt.toggleValue}
                  title={opt.hint}
                  aria-label={opt.hint}
                  aria-busy={pending && selected}
                  className={cn(
                    itemLayout,
                    outlineItem,
                    selectedItem,
                    pending && "cursor-wait",
                  )}
                >
                  {pending && selected ? (
                    <ButtonSpinner data-icon="inline-start" />
                  ) : Icon ? (
                    <Icon data-icon="inline-start" />
                  ) : null}
                  <span className="whitespace-nowrap leading-none">
                    {opt.label}
                  </span>
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>

          {pending ? (
            <p className="text-label-12 text-sio-fg-muted" aria-live="polite">
              Saving…
            </p>
          ) : null}

          {error ? (
            <p className="text-label-12 text-sio-status-danger-fg" role="alert">
              {error}. Try again or refresh the page.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
