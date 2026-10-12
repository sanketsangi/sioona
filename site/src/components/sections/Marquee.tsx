"use client";

import { useState } from "react";
import { PauseCircle, PlayCircle } from "@phosphor-icons/react/ssr";

const SLOTS = 10;

function LogoSlot() {
  return (
    <li className="flex h-11 w-36 shrink-0 items-center justify-center rounded-control border border-dashed border-sio-border-strong font-mono text-label-12 uppercase tracking-[0.06em] text-sio-fg-muted">
      Logo
    </li>
  );
}

/** Slow CSS marquee. Pauses on hover and focus, and via the visible toggle. */
export function Marquee() {
  const [paused, setPaused] = useState(true);
  return (
    <div className="marquee relative" data-paused={paused}>
      <div className="marquee-mask overflow-hidden">
        <div className="marquee-track gap-4 py-1">
          <ul className="flex shrink-0 gap-4 pr-4" aria-label="Customer logo placeholders">
            {Array.from({ length: SLOTS }, (_, i) => (
              <LogoSlot key={i} />
            ))}
          </ul>
          <ul className="marquee-dup flex shrink-0 gap-4 pr-4" aria-hidden>
            {Array.from({ length: SLOTS }, (_, i) => (
              <LogoSlot key={i} />
            ))}
          </ul>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setPaused((value) => !value)}
        aria-pressed={!paused}
        aria-label={paused ? "Play Logo Animation" : "Pause Logo Animation"}
        className="marquee-toggle btn-tertiary mx-auto mt-4 size-11 !px-0 md:size-8"
      >
        {paused ? <PlayCircle size={24} aria-hidden /> : <PauseCircle size={24} aria-hidden />}
      </button>
    </div>
  );
}
