"use client";

import { m, useScroll, useTransform, type MotionValue } from "framer-motion";
import { useRef } from "react";

const TEXT =
  "Your customers already tell you who is about to leave, who is ready to buy, and who needs more. It’s all sitting in chats nobody has time to read. Sioona surfaces it, and your people decide what to do.";

const WORDS = TEXT.split(" ");

function Word({ word, index, total, progress }: { word: string; index: number; total: number; progress: MotionValue<number> }) {
  const start = (index / total) * 0.75;
  const end = Math.min(1, start + 0.22);
  const opacity = useTransform(progress, [start, end], [0.16, 1]);
  const blur = useTransform(progress, [start, end], [6, 0]);
  const filter = useTransform(blur, (value) => `blur(${value.toFixed(2)}px)`);
  return (
    <>
      <m.span data-word className="inline-block" style={{ opacity, filter }}>
        {word}
      </m.span>{" "}
    </>
  );
}

/** Statement section: each word fades and sharpens as the block scrolls through. */
export function Statement() {
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.55"] });

  return (
    <section aria-labelledby="statement-eyebrow" className="section">
      <div className="container-page">
        <p id="statement-eyebrow" className="eyebrow">
          The Problem
        </p>
        <p ref={ref} className="text-heading-40 mt-6 max-w-4xl text-sio-fg-base">
          <span className="motion-safe:hidden">{TEXT}</span>
          <span className="hidden motion-safe:inline">
            {WORDS.map((word, index) => (
              <Word key={index} word={word} index={index} total={WORDS.length} progress={scrollYProgress} />
            ))}
          </span>
        </p>
      </div>
    </section>
  );
}
