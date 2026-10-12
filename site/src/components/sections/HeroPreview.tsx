"use client";

import { m, useInView, useReducedMotion } from "framer-motion";
import { createContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ease } from "@/lib/motion";

export const HeroPreviewEntered = createContext(false);

/** Observe a stable outer frame at any intersection, including scroll restoration. */
export function HeroPreview({ children }: { children: ReactNode }) {
  const trigger = useRef<HTMLDivElement>(null);
  const inView = useInView(trigger, { once: true, amount: "some", margin: "0px 0px -48px 0px" });
  const reduced = useReducedMotion();
  const [focused, setFocused] = useState(false);
  const [crossed, setCrossed] = useState(false);
  const entered = inView || crossed || reduced === true || focused;

  // IntersectionObserver can miss a frame skipped by a large scroll jump.
  // Check its top boundary once per animation frame, and remove listeners
  // after entry. This also handles restored scroll and viewport resizing.
  useEffect(() => {
    if (entered) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      const element = trigger.current;
      if (element && element.getBoundingClientRect().top <= window.innerHeight - 48) setCrossed(true);
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(read); };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("pageshow", schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("pageshow", schedule);
    };
  }, [entered]);

  return (
    <div ref={trigger} data-preview-trigger className="hero-preview-position">
      <HeroPreviewEntered.Provider value={entered}><m.div
        className="hero-preview"
        data-reveal
        data-entered={entered}
        onFocusCapture={() => setFocused(true)}
        initial={{ opacity: 0, y: 24, scale: 0.985 }}
        animate={entered ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 24, scale: 0.985 }}
        transition={{ duration: reduced ? 0 : 0.65, ease }}
      >
        {children}
      </m.div></HeroPreviewEntered.Provider>
    </div>
  );
}
