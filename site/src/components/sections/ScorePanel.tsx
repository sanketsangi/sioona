"use client";
import { PILOT_GO_THRESHOLD } from "@/lib/public-facts";


import { m } from "framer-motion";
import { Info } from "@phosphor-icons/react/ssr";
import { useRef } from "react";
import { duration, ease } from "@/lib/motion";

const SCORE = 84;
const GO_THRESHOLD = PILOT_GO_THRESHOLD;
const BATCHES = [70, 76, 82, 85, 88, 89];

const R = 100;
const CX = 120;
const CY = 120;

function arcPoint(fraction: number) {
  const angle = Math.PI * fraction;
  return { x: CX - R * Math.cos(angle), y: CY - R * Math.sin(angle) };
}

export function ScorePanel({ compact = false }: { compact?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const started = true;

  const goStart = arcPoint(GO_THRESHOLD / 100);
  const goEnd = arcPoint(1);
  const needleAngle = (SCORE / 100) * 180 - 90;

  return (
    <div ref={ref} className={compact ? "menu-score-panel" : "panel p-5 lg:p-6"}>
      <div className={compact ? "hidden" : "flex items-center justify-between gap-3"}>
        <p className="eyebrow">Signal Score</p>
        <span className="inline-flex h-6 items-center gap-1 rounded-full bg-sio-bg-muted px-2 text-[12px]/[24px] font-medium text-sio-fg-subtle">
          <Info size={14} weight="regular" aria-hidden />
          Illustrative
        </span>
      </div>

      <div
        role="img"
        aria-label={`Illustrative Signal Score gauge showing ${SCORE} percent against a go threshold of ${GO_THRESHOLD} percent.`}
        className={compact ? "mx-auto w-full max-w-[164px]" : "mx-auto mt-6 w-full max-w-[280px]"}
      >
        <div
          className="relative mx-auto aspect-[2/1] w-full"
          style={{ ["--needle" as string]: `${needleAngle}deg` }}
        >
          <svg viewBox="0 0 240 120" className="absolute inset-0 size-full" aria-hidden>
            <path
              d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
              fill="none"
              strokeWidth={10}
              strokeLinecap="butt"
              className="stroke-sio-border-base"
            />
            <path
              d={`M ${goStart.x.toFixed(1)} ${goStart.y.toFixed(1)} A ${R} ${R} 0 0 1 ${goEnd.x.toFixed(1)} ${goEnd.y.toFixed(1)}`}
              fill="none"
              strokeWidth={10}
              strokeLinecap="butt"
              className="stroke-sio-status-success-accent"
            />
          </svg>
          <m.div
            aria-hidden
            className="score-needle absolute bottom-0 left-1/2 h-[82%] w-0.5 -ml-px origin-bottom rounded-full bg-sio-fg-base"
            initial={false}
            animate={{ rotate: needleAngle }}
            transition={{ duration: 1.4, ease }}
          />
          <span
            aria-hidden
            className="absolute bottom-0 left-1/2 size-3 -translate-x-1/2 translate-y-1/2 rounded-full bg-sio-fg-base"
          />
        </div>
        <div className={compact ? "mt-2 text-center" : "mt-4 text-center"}>
          <p className="tabular text-heading-40 text-sio-fg-base">
            <span>{SCORE}</span>
            <span aria-hidden>%</span>
          </p>
          <p className="mt-1 text-label-13 text-sio-fg-muted">Illustrative · example data</p>
          <p className="mt-1 text-label-13 text-sio-fg-muted">
            Go zone starts at <span className="tabular">{GO_THRESHOLD}%</span>
          </p>
        </div>
      </div>

      <div className={compact ? "mt-3 border-t border-sio-border-base pt-3" : "mt-6 border-t border-sio-border-base pt-5"}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-label-13 font-medium text-sio-fg-base">Precision by review batch</p>
          <p className="text-label-12 text-sio-fg-muted">Illustrative</p>
        </div>
        <div tabIndex={0}
          className={compact ? "score-batch-chart relative mt-3 h-[90px]" : "score-batch-chart relative mt-4 h-[148px]"} role="img" aria-label={`Illustrative precision by review batch: ${BATCHES.join(", ")} percent.`}>
          <div
            aria-hidden
            className="absolute inset-x-0 border-t border-dashed border-sio-border-strong"
            style={{ bottom: `calc((100% - 20px) * ${(GO_THRESHOLD * 0.8) / 100} + 20px)` }}
          />
          <div aria-hidden className="absolute inset-x-0 bottom-5 top-0 flex items-end gap-2">
            {BATCHES.map((value, index) => {
              const pass = value >= GO_THRESHOLD;
              return (
                <div key={index} className="score-batch-column flex h-full flex-1 flex-col justify-end">
                  <m.span
                    data-reveal
                    className="score-label tabular mb-1 text-center text-label-12 text-sio-fg-subtle"
                    initial={false}
                    animate={{ opacity: started ? 1 : 0 }}
                    transition={{ duration: duration.base, ease, delay: 0.5 + index * 0.08 }}
                  >
                    {value}
                  </m.span>
                  <m.div
                    className={`score-bar origin-bottom rounded-t-[3px] ${pass ? "bg-sio-status-success-accent" : "bg-sio-border-strong"}`}
                    style={{ height: `${value * 0.8}%` }}
                    initial={false}
                    animate={{ scaleY: started ? 1 : 0 }}
                    transition={{ duration: duration.slow, ease, delay: 0.3 + index * 0.08 }}
                  />
                </div>
              );
            })}
          </div>
          <div aria-hidden className="absolute inset-x-0 bottom-0 flex gap-2">
            {BATCHES.map((_, index) => (
              <span key={index} className="flex-1 text-center font-mono text-label-12 text-sio-fg-muted">
                B{index + 1}
              </span>
            ))}
          </div>
        </div>
        <p className="mt-3 flex items-center gap-2 text-label-12 text-sio-fg-muted">
          <span aria-hidden className="inline-block h-0 w-4 border-t border-dashed border-sio-border-strong" />
          Go threshold
          <span aria-hidden className="ml-2 inline-block size-2 rounded-[2px] bg-sio-status-success-accent" />
          At or above threshold
        </p>
      </div>
    </div>
  );
}
