"use client";

import {
  m,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { ArrowRight, Check, FileText, ChatCircleText } from "@phosphor-icons/react/ssr";
import { useCallback, useRef, useState } from "react";
import {
  SignalScoreChip,
  SignalStatus,
  SignalTypeChip,
  SignalUser,
  type SignalState,
} from "@/components/signal/SignalChips";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { duration, ease } from "@/lib/motion";
import { STEPS } from "@/lib/steps";
import { nb } from "@/lib/site";
import { useMediaQuery } from "@/lib/useMediaQuery";

const CARD_POS = {
  desktop: [
    { x: 112, y: 0, scale: 0.97 },
    { x: 0, y: 0, scale: 1 },
    { x: -128, y: 0, scale: 0.97 },
    { x: -128, y: 0, scale: 0.97 },
  ],
  mobile: [
    { x: 0, y: 56, scale: 0.97 },
    { x: 0, y: 0, scale: 1 },
    { x: 0, y: -82, scale: 0.94 },
    { x: 0, y: -82, scale: 0.94 },
  ],
} as const;

const SIDE_POS = {
  desktop: { x: 132, y: 0 },
  mobile: { x: 0, y: 96 },
} as const;

function RailSegment({ index, progress }: { index: number; progress: MotionValue<number> }) {
  const fill = useTransform(progress, [index / 4, (index + 1) / 4], [0, 1], { clamp: true });
  return (
    <span className="relative h-0.5 flex-1 overflow-hidden rounded-full bg-sio-bg-muted">
      <m.span className="absolute inset-0 origin-left bg-sio-fg-base" style={{ scaleX: fill }} />
    </span>
  );
}

function SourceRow({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-control border border-sio-border-base bg-sio-bg-base px-2.5 text-label-13 text-sio-fg-base lg:flex-none">
      <span className="shrink-0 text-sio-fg-subtle">{icon}</span>
      <span className="truncate">{label}</span>
    </div>
  );
}

function Keycap({ children }: { children: string }) {
  return (
    <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-[4px] border border-sio-border-strong font-mono text-[11px] text-sio-fg-subtle">
      {children}
    </span>
  );
}

function Stage({ step }: { step: number }) {
  const desktop = useMediaQuery("(min-width: 1024px)", true);
  const pos = CARD_POS[desktop ? "desktop" : "mobile"][step];
  const side = SIDE_POS[desktop ? "desktop" : "mobile"];
  const state: SignalState = step >= 3 ? "acted" : step >= 2 ? "correct" : "pending";
  const t = { duration: duration.slow, ease };
  const tf = { duration: duration.base, ease };

  return (
    <div
      role="img"
      aria-label={`Illustration of step ${step + 1}: ${STEPS[step].title}`}
      className="relative h-[372px] overflow-hidden rounded-panel bg-sio-bg-muted lg:h-[440px]"
    >
      <div aria-hidden className="absolute inset-0 grid place-items-center">
        <m.div
          className="col-start-1 row-start-1 flex w-[min(300px,calc(100%-24px))] flex-row gap-2 lg:w-[140px] lg:flex-col"
          initial={false}
          animate={{ opacity: step === 0 ? 1 : 0, x: desktop ? -176 : 0, y: desktop ? (step === 0 ? 0 : -8) : step === 0 ? -128 : -136 }}
          transition={t}
        >
          <SourceRow icon={<ChatCircleText size={16} weight="regular" />} label="Intercom" />
          <SourceRow icon={<ChatCircleText size={16} weight="regular" />} label="WhatsApp" />
          <SourceRow icon={<FileText size={16} weight="regular" />} label="CSV or JSON" />
        </m.div>

        <m.div
          className="col-start-1 row-start-1 hidden text-sio-fg-muted lg:block"
          initial={false}
          animate={{ opacity: step === 0 ? 1 : 0, x: step === 0 ? -62 : -76 }}
          transition={t}
        >
          <ArrowRight size={16} weight="bold" />
        </m.div>

        <m.div
          className="col-start-1 row-start-1 flex w-[min(280px,calc(100%-24px))] flex-col gap-2.5 rounded-panel border border-sio-border-base bg-sio-bg-base p-3 lg:w-[260px]"
          initial={false}
          animate={pos}
          transition={t}
        >
          <div className="flex items-center justify-between gap-2">
            <SignalUser name="Maya Rossi" size={24} />
            <span className="grid">
              {(["pending", "correct", "acted"] as const).map((s) => (
                <m.span
                  key={s}
                  className="col-start-1 row-start-1 justify-self-end"
                  initial={false}
                  animate={{ opacity: state === s ? 1 : 0 }}
                  transition={tf}
                >
                  <SignalStatus state={s} variant="chip" />
                </m.span>
              ))}
            </span>
          </div>
          <p className="text-copy-14 text-sio-fg-subtle">
            …if I can’t find a better plan this week,{" "}
            <span className="relative whitespace-nowrap text-sio-fg-base">
              <m.span
                className="absolute -inset-x-1 inset-y-0 origin-left rounded-[3px] bg-sio-signal-retention-bg ring-1 ring-sio-signal-retention-accent"
                initial={false}
                animate={{ scaleX: step >= 1 ? 1 : 0, opacity: step >= 1 ? 1 : 0 }}
                transition={{ ...t, delay: step === 1 ? 0.15 : 0 }}
              />
              <span className="relative">I’ll close my account</span>
            </span>{" "}
            and move my savings…
          </p>
          <m.div
            className="flex items-center gap-1.5"
            initial={false}
            animate={{ opacity: step >= 1 ? 1 : 0, y: step >= 1 ? 0 : 6 }}
            transition={{ ...tf, delay: step === 1 ? 0.45 : 0 }}
          >
            <SignalTypeChip type="retention" />
            <SignalScoreChip score={0.92} />
          </m.div>
        </m.div>

        <m.div
          className="col-start-1 row-start-1 flex w-[min(280px,calc(100%-24px))] flex-col gap-2 rounded-panel border border-sio-border-base bg-sio-bg-base p-3 lg:w-[220px]"
          initial={false}
          animate={{ opacity: step === 2 ? 1 : 0, x: side.x, y: side.y + (step === 2 ? 0 : 8) }}
          transition={t}
        >
          <p className="eyebrow">Human Review</p>
          <p className="text-label-13 text-sio-fg-muted">Is this signal right?</p>
          <div className="mt-1 flex flex-col gap-1.5">
            {[
              { label: "Correct", key: "C", chosen: true },
              { label: "Incorrect", key: "I", chosen: false },
              { label: "Partially Correct", key: "P", chosen: false },
            ].map((option) => (
              <div
                key={option.label}
                className="relative flex h-8 items-center justify-between gap-2 overflow-hidden rounded-control border border-sio-border-base px-2.5 text-label-13 text-sio-fg-base"
              >
                {option.chosen ? (
                  <m.span
                    aria-hidden
                    className="absolute inset-0 bg-sio-status-success-bg"
                    initial={false}
                    animate={{ opacity: step === 2 ? 1 : 0 }}
                    transition={{ ...tf, delay: step === 2 ? 0.7 : 0 }}
                  />
                ) : null}
                <span className="relative flex items-center gap-1.5 truncate">
                  {option.chosen ? (
                    <m.span
                      className="text-sio-status-success-fg"
                      initial={false}
                      animate={{ opacity: step === 2 ? 1 : 0, scale: step === 2 ? 1 : 0.7 }}
                      transition={{ ...tf, delay: step === 2 ? 0.8 : 0 }}
                    >
                      <Check size={14} weight="bold" />
                    </m.span>
                  ) : null}
                  {option.label}
                </span>
                <span className="relative">
                  <Keycap>{option.key}</Keycap>
                </span>
              </div>
            ))}
          </div>
        </m.div>

        <m.div
          className="col-start-1 row-start-1 flex w-[min(280px,calc(100%-24px))] flex-col gap-2 rounded-panel border border-sio-border-base bg-sio-bg-base p-3 lg:w-[220px]"
          initial={false}
          animate={{ opacity: step === 3 ? 1 : 0, x: side.x, y: side.y + (step === 3 ? 0 : 8) }}
          transition={t}
        >
          <p className="eyebrow">Suggested Next Action</p>
          <p className="text-copy-14 text-sio-fg-base">Offer a fee review call.</p>
          <p className="text-label-13 text-sio-fg-muted">Display only. Nothing is sent from Sioona.</p>
          <m.div
            className="mt-1 inline-flex h-8 items-center justify-between gap-2 rounded-control border border-sio-border-subtle px-2.5 text-label-13 font-medium text-sio-fg-base"
            initial={false}
            animate={{ scale: step === 3 ? [1, 1, 0.95, 1] : 1 }}
            transition={{ duration: 1.2, times: [0, 0.5, 0.7, 1], ease }}
          >
            Mark Acted
            <Keycap>A</Keycap>
          </m.div>
        </m.div>
      </div>
    </div>
  );
}

export function ShadowStory() {
  const trackRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const { scrollYProgress } = useScroll({ target: trackRef, offset: ["start start", "end end"] });

  useMotionValueEvent(scrollYProgress, "change", (value) => {
    if (reduced) return;
    const next = Math.max(0, Math.min(STEPS.length - 1, Math.floor(value * STEPS.length)));
    setStep((current) => (current === next ? current : next));
  });

  const railFill = useTransform(scrollYProgress, [0, 1], [0, 1], { clamp: true });

  const goTo = useCallback(
    (index: number) => {
      if (reduced) {
        setStep(index);
        return;
      }
      const track = trackRef.current;
      if (!track) return;
      const top = window.scrollY + track.getBoundingClientRect().top;
      const range = track.offsetHeight - window.innerHeight;
      window.scrollTo({
        top: top + ((index + 0.5) / STEPS.length) * range,
        behavior: reduced ? "auto" : "smooth",
      });
    },
    [reduced],
  );

  return (
    <section id="how" aria-labelledby="story-title" className="section pb-0 lg:pb-0">
      <div className="container-page">
        <SectionHeader
          id="story-title"
          eyebrow="Shadow Mode"
          title="Detect first. Act only after a human says so."
          description="Shadow Mode keeps people in charge. Sioona proposes, your team decides, and nothing reaches a customer from Sioona."
        />
      </div>

      <div ref={trackRef} className="shadow-story-track relative mt-10 h-[400svh] lg:h-[340svh]">
        <div className="shadow-story-sticky sticky top-[var(--nav-height)] flex h-[calc(100svh-var(--nav-height))] items-center">
          <div className="container-page grid w-full items-center gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
            <div>
              <div className="mb-4 flex gap-2 lg:hidden" aria-hidden>
                {STEPS.map((s, index) => (
                  <RailSegment key={s.id} index={index} progress={scrollYProgress} />
                ))}
              </div>

              <div className="relative lg:pl-6">
                <div aria-hidden className="absolute bottom-0 left-0 top-0 hidden w-px bg-sio-border-base lg:block">
                  <m.div className="h-full w-px origin-top bg-sio-fg-base" style={{ scaleY: railFill }} />
                </div>
                <ol aria-label="Shadow Mode steps" className="shadow-story-steps flex flex-col gap-1 lg:gap-6">
                  {STEPS.map((s, index) => {
                    const active = index === step;
                    return (
                      <li key={s.id} className={active ? "block" : "hidden lg:block"}>
                        <m.div
                          initial={false}
                          animate={{ opacity: active ? 1 : 0.45 }}
                          transition={{ duration: duration.base, ease }}
                        >
                          <h3 className="text-heading-20 text-sio-fg-base">
                            <button
                              type="button"
                              onClick={() => goTo(index)}
                              aria-current={active ? "step" : undefined}
                              className="-mx-2 inline-flex min-h-11 items-center gap-3 rounded-control px-2 text-left lg:min-h-8"
                            >
                              <span className="tabular font-mono text-label-12 text-sio-fg-muted">0{index + 1}</span>
                              {s.title}
                            </button>
                          </h3>
                          <p className="text-copy-14 mt-1 max-w-md text-sio-fg-subtle lg:text-copy-16">{nb(s.body)}</p>
                        </m.div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </div>

            <Stage step={step} />
          </div>
        </div>
      </div>
    </section>
  );
}
