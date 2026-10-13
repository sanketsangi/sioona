"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { Stage } from "@/app/how-it-works/FourStepScroll";
import { STEP, useInsightsScript } from "@/components/mocks/useInsightsScript";
import { SignalTypeChip, SignalUser, SignalScoreChip, SignalStatus } from "@/components/signal/SignalChips";
import { ScorePanel } from "@/components/sections/ScorePanel";
import { BentoFeatureVisual } from "@/components/sections/Bento";

const CHAT_QUOTE = "I’ll close my account";
const CHAT_PARTS = ["If I can’t find a better plan this week, ", CHAT_QUOTE, " and move my savings elsewhere."];
const CHAT = CHAT_PARTS.join("");

export function OutputPreview({ running = false }: { running?: boolean }) {
  const reduced = !!useReducedMotion();
  const { step, chars } = useInsightsScript({ totalChars: CHAT.length, running, reduced, startAtBeginning: false });
  const detected = step >= STEP.why && step < STEP.reset;
  const action = step >= STEP.correct && step < STEP.reset;
  const acted = step === STEP.acted;
  return <div className="menu-output-preview">
    <div className="menu-output-user">
      <SignalUser name="Maya Rossi" size={28} />
      <div className="menu-output-user-status"><span className="menu-output-score" data-visible={detected}><SignalScoreChip score={0.92} /></span><SignalStatus state={acted ? "acted" : action ? "correct" : "pending"} variant="chip" /></div>
    </div>
    <div className="menu-output-conversation" role="group" aria-label="Customer message">
    <div className="menu-output-chat"><p>{CHAT_PARTS.map((part, index) => {
      const start = CHAT_PARTS.slice(0, index).join("").length;
      const visible = Math.max(0, Math.min(part.length, chars - start));
      const text = <>{part.slice(0, visible)}<span className="opacity-0">{part.slice(visible)}</span></>;
      return index === 1 ? <mark key={index} className="menu-output-highlight" data-detected={detected} aria-label={detected ? "Evidence: customer states they plan to leave" : undefined}>{text}</mark> : <span key={index}>{text}</span>;
    })}</p></div>
    </div>
    <div className="menu-output-evidence" data-visible={detected}><h3 className="eyebrow menu-evidence-heading">Why This Fired</h3><div className="menu-output-evidence-detail"><SignalTypeChip type="retention" /><span>“I’ll close my account”</span></div><p className="menu-output-reason">Customer may close their account if they can’t find a better plan.</p></div>
    <div className="menu-output-action" data-visible={action}><div className="menu-action-copy"><span className="eyebrow">Suggested next action</span><p>Offer a fee review call. Nothing sends.</p></div><span className="menu-acted-indicator" data-acted={acted}>{acted ? "✓ Acted" : "Mark Acted"}<kbd aria-hidden>A</kbd></span></div>
  </div>;
}

export function WorkflowPreview({ running = false }: { running?: boolean }) {
  const reduced = useReducedMotion();
  const [step, setStep] = useState(3);
  useEffect(() => {
    if (reduced || !running) return;
    const timer = window.setInterval(() => setStep((value) => (value + 1) % 4), 2200);
    return () => { window.clearInterval(timer); };
  }, [reduced, running]);
  return <div className="menu-workflow-preview">
    <Stage step={reduced ? 3 : step} compact />
  </div>;
}

export function ScorePreview() {
  return <div className="menu-score-preview"><ScorePanel compact /></div>;
}

const featureNames = ["Insights", "Upload", "Eval", "Taxonomy", "Suggested next action", "Keyboard-first review"];
const featureDescriptions = ["Evidence, review, and your next move.", "Bring your chats into the workspace.", "Measure precision against human judgment.", "Define the signals that matter to you.", "A clear follow-up. Your team decides.", "Keep reviews moving with keyboard shortcuts."];

export function FeaturePreview({ running = false }: { running?: boolean }) {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (reduced || !running) return;
    const timer = window.setInterval(() => setActive((value) => (value + 1) % featureNames.length), 3200);
    return () => window.clearInterval(timer);
  }, [reduced, running]);
  return <div className="menu-feature-sequence">
    <div className="menu-feature-stage">
      <AnimatePresence initial={false}>
      {featureNames.map((name, index) => active === index ? <m.div key={name} className="menu-feature-scene" data-active="true"
        initial={{ x: reduced ? 0 : "110%", opacity: reduced ? 1 : 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: reduced ? 0 : "-110%", opacity: 0 }}
        transition={{ duration: reduced ? 0 : 0.55, ease: [0.22, 1, 0.36, 1] }}>
        <h3>{name}</h3><p>{featureDescriptions[index]}</p>
        <div className="menu-feature-visual"><BentoFeatureVisual index={index} /></div>
      </m.div> : null)}
      </AnimatePresence>
    </div>
  </div>;
}

